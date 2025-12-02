export async function getGithubRepoInfo() {
  try {
    const res = await fetch(
      'https://api.github.com/repos/Openpanel-dev/openpanel',
    );
    return res.json();
  } catch (e) {
    return null;
  }
}
