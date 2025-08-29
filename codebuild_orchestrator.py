#!/usr/bin/env python3

import json
import os
import subprocess
import sys
from collections import defaultdict, deque
import boto3
import re
import logging

# Configure the root logger
logging.basicConfig(
    level=logging.INFO,                           # default threshold
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),        # print to stdout
    ]
)
logger = logging.getLogger(__name__)

# Initialize AWS clients
ecr_client = boto3.client('ecr')

# Environment variables
AWS_ACCOUNT_ID = os.environ.get('AWS_ACCOUNT_ID')
AWS_DEFAULT_REGION = os.environ.get('AWS_DEFAULT_REGION')
CURRENT_COMMIT = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()

# ECR repository base URL
ECR_BASE_URL = f"{AWS_ACCOUNT_ID}.dkr.ecr.{AWS_DEFAULT_REGION}.amazonaws.com"

def load_dependencies():
    """Load dependency configuration from JSON file"""
    with open('codebuild_dependencies.json', 'r') as f:
        return json.load(f)

def get_all_apps(dependencies):
    """Extract all application names from dependencies"""
    return set(dependencies['sourceDependencies'].keys())

def get_latest_commit_ids(apps):
    """Get latest commit IDs for all apps using latest tag"""
    commit_ids = {}
    apps_without_history = set()

    for app_name in apps:
        try:
            response = ecr_client.describe_images(
                repositoryName=app_name,
                imageIds=[{'imageTag': 'latest'}]
            )
            
            if not response['imageDetails']:
                logger.warning("No 'latest' tag found for %s", app_name)
                apps_without_history.add(app_name)
                continue

            # Get all tags for the same image (same SHA256) as latest
            image_tags = response['imageDetails'][0].get('imageTags', [])
            pushed_at = response['imageDetails'][0].get('imagePushedAt')

            # Find commit IDs from tags (supports both formats)
            commit_tags = []
            commit_pattern = re.compile(r'^([a-f0-9]+)$')
            for tag in image_tags:
                # Look for commit-only tags (just commit hash)
                commit_match = re.match(commit_pattern, tag)
                if commit_match:
                    commit_id = commit_match.group(1)
                    commit_tags.append((pushed_at, commit_id, tag))

            if commit_tags:
                # Sort by timestamp and pick the most recent
                commit_tags.sort(key=lambda x: x[0], reverse=True)
                _, commit_id, tag_used = commit_tags[0]
                commit_ids[app_name] = commit_id
                logger.info(
                    "%s: Using commit %s from tag %s (pushed at %s, %d equivalent tags)",
                    app_name, commit_id, tag_used, pushed_at, len(commit_tags),
                )
            else:
                logger.warning("No commit tags found for %s", app_name)
                apps_without_history.add(app_name)
    
        except ecr_client.exceptions.ImageNotFoundException:
            logger.warning("No history found for %s in ECR", app_name)
            apps_without_history.add(app_name)

    return commit_ids, apps_without_history

def get_changed_files_for_app(app_name, commit_id):
    """Get changed files for a specific app from its last commit to HEAD"""
    try:
        cmd = ['git', 'diff', '--name-only', f'{commit_id}..HEAD']
        result = subprocess.check_output(cmd).decode().strip()
        if result:
            changed_files = set(result.split('\n'))
            logger.info("%s: %d files changed since %s", app_name, len(changed_files), commit_id)
            return changed_files
        else:
            logger.info("%s: No files changed since %s", app_name, commit_id)
            return set()
    except subprocess.CalledProcessError as e:
        logger.error("Error getting changed files for %s since %s", app_name, commit_id)
        raise e

def find_source_impacted_apps(commit_ids, source_dependencies):
    """Find apps impacted by analyzing each app's specific commit range"""
    base_impacted_apps = set()

    for app_name, commit_id in commit_ids.items():
        try:
            changed_files = get_changed_files_for_app(app_name, commit_id)
            if changed_files:
                app_dependencies = source_dependencies.get(app_name, [])
                is_impacted = False

                for changed_file in changed_files:
                    cf = os.path.normpath(changed_file)
                    for dep_path in app_dependencies:
                        dep_path = os.path.normpath(dep_path)
                        if is_path_affected(cf, dep_path):
                            logger.info("%s impacted by change to %s (dependency: %s)", app_name, cf, dep_path)
                            is_impacted = True
                            break
                    if is_impacted:
                        break

                if is_impacted:
                    logger.info("%s is impacted by changes since its last commit %s", app_name, commit_id)
                    base_impacted_apps.add(app_name)
                else:
                    logger.info("%s is NOT impacted by changes since its last commit %s", app_name, commit_id)
        except Exception as e:
            logger.info("Marking %s as impacted due to error computing changed files since its last commit: ", app_name, e)
            base_impacted_apps.add(app_name)

    return base_impacted_apps

def is_path_affected(changed_file, dependency_path):
    """Check if a changed file affects a dependency path"""
    if changed_file == dependency_path:
        return True
    if changed_file.startswith(dependency_path + os.sep):
        return True
    if dependency_path.startswith(changed_file + os.sep):
        return True
    return False

def build_reverse_app_dependency_map(app_dependencies):
    """Build a map from app to apps that depend on it"""
    reverse_map = defaultdict(set)

    for app_name, deps in app_dependencies.items():
        for dep in deps:
            reverse_map[dep].add(app_name)

    return reverse_map

def find_all_impacted_apps(base_impacted_apps, reverse_app_map):
    """Find all apps impacted through dependency chain"""
    all_impacted = set(base_impacted_apps)
    to_process = list(base_impacted_apps)
    
    while to_process:
        current_app = to_process.pop()
        for dep_app in reverse_app_map.get(current_app, set()):
            if dep_app not in all_impacted:
                logger.info("%s impacted through dependency on %s", dep_app, current_app)
                all_impacted.add(dep_app)
                to_process.append(dep_app)

    return all_impacted

def topological_sort(impacted_apps, app_dependencies):
    """Perform topological sort on impacted applications"""
    graph = defaultdict(list)
    in_degree = defaultdict(int)

    for app in impacted_apps:
        in_degree[app] = 0

    for app in impacted_apps:
        for dep in app_dependencies.get(app, []):
            if dep in impacted_apps:
                graph[dep].append(app)
                in_degree[app] += 1

    queue = deque([a for a in impacted_apps if in_degree[a] == 0])
    sorted_apps = []

    while queue:
        a = queue.popleft()
        sorted_apps.append(a)
        for nbr in graph[a]:
            in_degree[nbr] -= 1
            if in_degree[nbr] == 0:
                queue.append(nbr)

    if len(sorted_apps) != len(impacted_apps):
        raise ValueError("Circular dependency detected!")

    return sorted_apps

def build_app(app_name):
    """Build an application by calling its build function"""
    logger.info("Building %s...", app_name)

    build_func_name = f"build_{app_name.replace('-', '_')}"

    if build_func_name not in globals():
        logger.error("Build function `%s` not found for app `%s`", build_func_name, app_name)
        return False

    try:
        return globals()[build_func_name]()
    except Exception:
        logger.exception("Error building %s", app_name)
        return False

def pre_build_app(app_name, has_history):
    """Pre build an application by calling its pre build function"""
    logger.info("Pre building %s...", app_name)

    pre_build_func_name = f"pre_build_{app_name.replace('-', '_')}"

    if pre_build_func_name not in globals():
        logger.error("Pre build function `%s` not found for app `%s`", pre_build_func_name, app_name)
        return False

    try:
        return globals()[pre_build_func_name](has_history)
    except Exception:
        logger.exception("Error pre building %s", app_name)
        return False

def post_build_app(app_name):
    """Post build an application by calling its post build function"""
    logger.info("Post building %s...", app_name)

    post_build_func_name = f"postbuild_{app_name.replace('-', '_')}"

    if post_build_func_name not in globals():
        logger.error("Post build function `%s` not found for app `%s`", post_build_func_name, app_name)
        return False

    try:
        return globals()[post_build_func_name]()
    except Exception:
        logger.exception("Error post building %s", app_name)
        return False

def main():
    """Main orchestration function"""
    logger.info("Current commit: %s", CURRENT_COMMIT)

    logger.info("Loading dependencies...")
    dependencies = load_dependencies()
    source_deps = dependencies['sourceDependencies']
    app_deps = dependencies['appDependencies']

    all_apps = get_all_apps(dependencies)
    logger.info("Found %d applications: %s", len(all_apps), all_apps)
    
    logger.info("Fetching latest commit IDs from ECR...")
    commit_ids, apps_without_history = get_latest_commit_ids(all_apps)

    base_impacted_apps = set(apps_without_history)
    if apps_without_history:
        logger.warning("Apps without build history (will be built): %s", apps_without_history)

    if commit_ids:
        logger.info("Analyzing per-app file changes...")
        base_impacted_apps.update(find_source_impacted_apps(commit_ids, source_deps))

    if not base_impacted_apps:
        logger.info("No applications impacted by changes")
        return 0

    logger.info("Base impacted applications: %s", base_impacted_apps)

    logger.info("Analyzing application dependencies...")
    reverse_app_map = build_reverse_app_dependency_map(app_deps)
    all_impacted = find_all_impacted_apps(base_impacted_apps, reverse_app_map)
    logger.info("Total impacted applications: %s", all_impacted)

    logger.info("Performing topological sort...")
    sorted_apps = topological_sort(all_impacted, app_deps)
    logger.info("Build order: %s", sorted_apps)

    failed = False
    for app in sorted_apps:
        if not pre_build_app(app, app not in apps_without_history):
            failed = True
            logger.error("Failed to pre build %s", app)
    if not failed:
        logger.info("All applications pre built successfully!")

    for app in sorted_apps:
        if not build_app(app):
            logger.error("Failed to build %s", app)
            return 1
    logger.info("All applications built successfully!")

    failed = False
    for app in sorted_apps:
        if not post_build_app(app):
            failed = True
            logger.error("Failed to post build %s", app)
    if not failed:
        logger.info("All applications post built successfully!")
        return 0

    return 1


##### App build functions follow #####

### OpenPanel API

def pre_build_openpanel_api(has_history):
    """Pre build function for OpenPanel API"""
    logger.info("Pre building OpenPanel API")
    if has_history:
        proc = subprocess.run(['docker','pull',f'{ECR_BASE_URL}/openpanel_api:latest'])
        proc.check_returncode()
    else:
        logger.info('No history for OpenPanel API')
    logger.info("Pre built OpenPanel API")
    return True

def build_openpanel_api():
    """Build function for OpenPanel API"""
    logger.info("Building OpenPanel API")
    proc = subprocess.run([
        'docker', 'build', 
        '--build-arg', f'IMAGE_REGISTRY={ECR_BASE_URL}',
        '-f', 'apps/api/Dockerfile', 
        '--cache-from', f'{ECR_BASE_URL}/openpanel_api:latest',
        '-t', f'{ECR_BASE_URL}/openpanel_api:{CURRENT_COMMIT}',
        os.getcwd()
    ])
    proc.check_returncode()
    proc = subprocess.run(['docker','tag', f'{ECR_BASE_URL}/openpanel_api:{CURRENT_COMMIT}', f'{ECR_BASE_URL}/openpanel_api:latest'])
    proc.check_returncode()
    logger.info("Built OpenPanel API")
    return True

def postbuild_openpanel_api():
    """Post build function for OpenPanel API"""
    logger.info("Post building OpenPanel API")
    proc = subprocess.run(['docker','push', f'{ECR_BASE_URL}/openpanel_api:{CURRENT_COMMIT}'])
    failed = False
    if proc.returncode != 0:
        failed = True
        logger.error(f'Failed to push {ECR_BASE_URL}/openpanel_api:{CURRENT_COMMIT}: exit code {proc.returncode}')
    proc = subprocess.run(['docker','push', f'{ECR_BASE_URL}/openpanel_api:latest'])
    if proc.returncode != 0:
        failed = True
        logger.error(f'Failed to push {ECR_BASE_URL}/openpanel_api:latest: exit code {proc.returncode}')
    logger.info("Post built OpenPanel API")
    return not failed


### OpenPanel Dashboard

def pre_build_openpanel_dashboard(has_history):
    """Pre build function for OpenPanel Dashboard"""
    logger.info("Pre building OpenPanel Dashboard")
    if has_history:
        proc = subprocess.run(['docker','pull',f'{ECR_BASE_URL}/openpanel_dashboard:latest'])
        proc.check_returncode()
    else:
        logger.info('No history for OpenPanel Dashboard')
    logger.info("Pre built OpenPanel Dashboard")
    return True

def build_openpanel_dashboard():
    """Build function for OpenPanel Dashboard"""
    logger.info("Building OpenPanel Dashboard")
    proc = subprocess.run([
        'docker', 'build', 
        '--build-arg', f'IMAGE_REGISTRY={ECR_BASE_URL}',
        '-f', 'apps/dashboard/Dockerfile', 
        '--cache-from', f'{ECR_BASE_URL}/openpanel_dashboard:latest',
        '-t', f'{ECR_BASE_URL}/openpanel_dashboard:{CURRENT_COMMIT}',
        os.getcwd()
    ])
    proc.check_returncode()
    proc = subprocess.run(['docker','tag', f'{ECR_BASE_URL}/openpanel_dashboard:{CURRENT_COMMIT}', f'{ECR_BASE_URL}/openpanel_dashboard:latest'])
    proc.check_returncode()
    logger.info("Built OpenPanel Dashboard")
    return True

def postbuild_openpanel_dashboard():
    """Post build function for OpenPanel Dashboard"""
    logger.info("Post building OpenPanel Dashboard")
    proc = subprocess.run(['docker','push', f'{ECR_BASE_URL}/openpanel_dashboard:{CURRENT_COMMIT}'])
    failed = False
    if proc.returncode != 0:
        failed = True
        logger.error(f'Failed to push {ECR_BASE_URL}/openpanel_dashboard:{CURRENT_COMMIT}: exit code {proc.returncode}')
    proc = subprocess.run(['docker','push', f'{ECR_BASE_URL}/openpanel_dashboard:latest'])
    if proc.returncode != 0:
        failed = True
        logger.error(f'Failed to push {ECR_BASE_URL}/openpanel_dashboard:latest: exit code {proc.returncode}')
    logger.info("Post built OpenPanel Dashboard")
    return not failed


### OpenPanel Worker

def pre_build_openpanel_worker(has_history):
    """Pre build function for OpenPanel Worker"""
    logger.info("Pre building OpenPanel Worker")
    if has_history:
        proc = subprocess.run(['docker','pull',f'{ECR_BASE_URL}/openpanel_worker:latest'])
        proc.check_returncode()
    else:
        logger.info('No history for OpenPanel Worker')
    logger.info("Pre built OpenPanel Worker")
    return True

def build_openpanel_worker():
    """Build function for OpenPanel Worker"""
    logger.info("Building OpenPanel Worker")
    proc = subprocess.run([
        'docker', 'build', 
        '--build-arg', f'IMAGE_REGISTRY={ECR_BASE_URL}',
        '-f', 'apps/worker/Dockerfile', 
        '--cache-from', f'{ECR_BASE_URL}/openpanel_worker:latest',
        '-t', f'{ECR_BASE_URL}/openpanel_worker:{CURRENT_COMMIT}',
        os.getcwd()
    ])
    proc.check_returncode()
    proc = subprocess.run(['docker','tag', f'{ECR_BASE_URL}/openpanel_worker:{CURRENT_COMMIT}', f'{ECR_BASE_URL}/openpanel_worker:latest'])
    proc.check_returncode()
    logger.info("Built OpenPanel Worker")
    return True

def postbuild_openpanel_worker():
    """Post build function for OpenPanel Worker"""
    logger.info("Post building OpenPanel Worker")
    proc = subprocess.run(['docker','push', f'{ECR_BASE_URL}/openpanel_worker:{CURRENT_COMMIT}'])
    failed = False
    if proc.returncode != 0:
        failed = True
        logger.error(f'Failed to push {ECR_BASE_URL}/openpanel_worker:{CURRENT_COMMIT}: exit code {proc.returncode}')
    proc = subprocess.run(['docker','push', f'{ECR_BASE_URL}/openpanel_worker:latest'])
    if proc.returncode != 0:
        failed = True
        logger.error(f'Failed to push {ECR_BASE_URL}/openpanel_worker:latest: exit code {proc.returncode}')
    logger.info("Post built OpenPanel Worker")
    return not failed


if __name__ == "__main__":
    sys.exit(main())