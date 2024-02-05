export async function parseIp(ip: string) {
  try {
    const geo = await fetch(`${process.env.GEO_IP_HOST}/${ip}`);
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
    console.log('Failed to parse ip', e);

    return {
      country: undefined,
      city: undefined,
      region: undefined,
      continent: undefined,
    };
  }
}
