import { stripTrailingSlash } from '@openpanel/common';
import {
  chQuery,
  db,
  getClientByIdCached,
  getProjectByIdCached,
} from '@openpanel/db';

const pickBestDomain = (domains: string[]): string | null => {
  // Filter out invalid domains
  const validDomains = domains.filter(
    (domain) =>
      domain &&
      !domain.includes('*') &&
      !domain.includes('localhost') &&
      !domain.includes('127.0.0.1'),
  );

  if (validDomains.length === 0) return null;

  // Score each domain
  const scoredDomains = validDomains.map((domain) => {
    let score = 0;

    // Prefer https (highest priority)
    if (domain.startsWith('https://')) score += 100;

    // Penalize domains from common providers like vercel, netlify, etc.
    if (
      domain.includes('vercel.app') ||
      domain.includes('netlify.app') ||
      domain.includes('herokuapp.com') ||
      domain.includes('github.io') ||
      domain.includes('gitlab.io') ||
      domain.includes('surge.sh') ||
      domain.includes('cloudfront.net') ||
      domain.includes('firebaseapp.com') ||
      domain.includes('azurestaticapps.net') ||
      domain.includes('pages.dev') ||
      domain.includes('ngrok-free.app') ||
      domain.includes('ngrok.app')
    ) {
      score -= 50;
    }

    // Penalize subdomains
    const domainParts = domain
      .replace('https://', '')
      .replace('http://', '')
      .split('.');
    if (domainParts.length <= 2) score += 50;

    // Tiebreaker: prefer shorter domains
    score -= domain.length;

    return { domain, score };
  });

  // Sort by score (highest first) and return the best domain
  const bestDomain = scoredDomains.sort((a, b) => b.score - a.score)[0];
  return bestDomain?.domain || null;
};

async function main() {
  const projects = await db.project.findMany({
    include: {
      clients: true,
    },
  });

  const matches = [];
  for (const project of projects) {
    const cors = [];
    let crossDomain = false;
    for (const client of project.clients) {
      if (client.crossDomain) {
        crossDomain = true;
      }
      cors.push(
        ...(client.cors?.split(',') ?? []).map((c) =>
          stripTrailingSlash(c.trim()),
        ),
      );
      await getClientByIdCached.clear(client.id);
    }

    let domain = pickBestDomain(cors);

    if (!domain) {
      const res = await chQuery<{ origin: string }>(
        `SELECT origin FROM events_distributed WHERE project_id = '${project.id}' and origin != ''`,
      );
      if (res.length) {
        domain = pickBestDomain(res.map((r) => r.origin));
        matches.push(domain);
      } else {
        console.log('No domain found for client');
      }
    }

    await db.project.update({
      where: { id: project.id },
      data: {
        cors,
        crossDomain,
        domain,
      },
    });
    console.log('Updated', {
      cors,
      crossDomain,
      domain,
    });

    await getProjectByIdCached.clear(project.id);
  }

  console.log('DONE');
  console.log('DONE');
  console.log('DONE');
  console.log('DONE');
}

main();
