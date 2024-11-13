export async function getGithubRepoInfo() {
  const res = await fetch(
    'https://api.github.com/repos/Openpanel-dev/openpanel',
  );
  return res.json();
}
