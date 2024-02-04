export async function parseIp(ip: string) {
  try {
    const geo = await fetch(`http://localhost:8080/${ip}`);
    const res = (await geo.json()) as {
      country: string | undefined;
      city: string | undefined;
      stateprov: string | undefined;
      continent: string | undefined;
    };

    return {
      country: res.country,
      city: res.city,
      region: res.stateprov,
      continent: res.continent,
    };
  } catch (e) {
    return {
      country: undefined,
      city: undefined,
      region: undefined,
      continent: undefined,
    };
  }
}
