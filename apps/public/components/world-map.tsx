'use client';

import DottedMap from 'dotted-map/without-countries';
import { useEffect, useMemo, useState } from 'react';
import { mapJsonString } from './world-map-string';

// Static coordinates list with 50 points
const COORDINATES = [
  // Western Hemisphere (Focused on West Coast)
  { lat: 47.6062, lng: -122.3321 }, // Seattle, USA
  { lat: 45.5155, lng: -122.6789 }, // Portland, USA
  { lat: 37.7749, lng: -122.4194 }, // San Francisco, USA
  { lat: 34.0522, lng: -118.2437 }, // Los Angeles, USA
  { lat: 32.7157, lng: -117.1611 }, // San Diego, USA
  { lat: 49.2827, lng: -123.1207 }, // Vancouver, Canada
  { lat: 58.3019, lng: -134.4197 }, // Juneau, Alaska
  { lat: 61.2181, lng: -149.9003 }, // Anchorage, Alaska
  { lat: 64.8378, lng: -147.7164 }, // Fairbanks, Alaska
  { lat: 71.2906, lng: -156.7886 }, // Utqiaġvik (Barrow), Alaska
  { lat: 60.5544, lng: -151.2583 }, // Kenai, Alaska
  { lat: 61.5815, lng: -149.444 }, // Wasilla, Alaska
  { lat: 66.1666, lng: -153.3707 }, // Bettles, Alaska
  { lat: 63.8659, lng: -145.637 }, // Delta Junction, Alaska
  { lat: 55.3422, lng: -131.6461 }, // Ketchikan, Alaska

  // Eastern Hemisphere (Focused on East Asia)
  { lat: 35.6762, lng: 139.6503 }, // Tokyo, Japan
  { lat: 43.0621, lng: 141.3544 }, // Sapporo, Japan
  { lat: 26.2286, lng: 127.6809 }, // Naha, Japan
  { lat: 31.2304, lng: 121.4737 }, // Shanghai, China
  { lat: 22.3193, lng: 114.1694 }, // Hong Kong
  { lat: 37.5665, lng: 126.978 }, // Seoul, South Korea
  { lat: 25.033, lng: 121.5654 }, // Taipei, Taiwan

  // Russian Far East
  { lat: 64.7336, lng: 177.5169 }, // Anadyr, Russia
  { lat: 59.5613, lng: 150.8086 }, // Magadan, Russia
  { lat: 43.1332, lng: 131.9113 }, // Vladivostok, Russia
  { lat: 53.0444, lng: 158.6478 }, // Petropavlovsk-Kamchatsky, Russia
  { lat: 62.0355, lng: 129.6755 }, // Yakutsk, Russia
  { lat: 48.4827, lng: 135.0846 }, // Khabarovsk, Russia
  { lat: 46.9589, lng: 142.7319 }, // Yuzhno-Sakhalinsk, Russia
  { lat: 52.9651, lng: 158.2728 }, // Yelizovo, Russia
  { lat: 56.1304, lng: 101.614 }, // Bratsk, Russia

  // Australia & New Zealand (Main Cities)
  { lat: -33.8688, lng: 151.2093 }, // Sydney, Australia
  { lat: -37.8136, lng: 144.9631 }, // Melbourne, Australia
  { lat: -27.4698, lng: 153.0251 }, // Brisbane, Australia
  { lat: -31.9505, lng: 115.8605 }, // Perth, Australia
  { lat: -12.4634, lng: 130.8456 }, // Darwin, Australia
  { lat: -34.9285, lng: 138.6007 }, // Adelaide, Australia
  { lat: -42.8821, lng: 147.3272 }, // Hobart, Australia
  { lat: -16.9186, lng: 145.7781 }, // Cairns, Australia
  { lat: -23.7041, lng: 133.8814 }, // Alice Springs, Australia
  { lat: -41.2865, lng: 174.7762 }, // Wellington, New Zealand
  { lat: -36.8485, lng: 174.7633 }, // Auckland, New Zealand
  { lat: -43.532, lng: 172.6306 }, // Christchurch, New Zealand
];

const getRandomCoordinates = (count: number) => {
  const shuffled = [...COORDINATES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export function WorldMap() {
  const [visiblePins, setVisiblePins] = useState<typeof COORDINATES>([
    { lat: 61.2181, lng: -149.9003 },
    { lat: 31.2304, lng: 121.4737 },
    { lat: 59.5613, lng: 150.8086 },
    { lat: 64.8378, lng: -147.7164 },
    { lat: -33.8688, lng: 151.2093 },
    { lat: 43.0621, lng: 141.3544 },
    { lat: 58.3019, lng: -134.4197 },
    { lat: 37.5665, lng: 126.978 },
    { lat: -41.2865, lng: 174.7762 },
    { lat: -36.8485, lng: 174.7633 },
    { lat: -31.9505, lng: 115.8605 },
    { lat: 35.6762, lng: 139.6503 },
    { lat: 49.2827, lng: -123.1207 },
    { lat: -12.4634, lng: 130.8456 },
    { lat: 56.1304, lng: 101.614 },
    { lat: 22.3193, lng: 114.1694 },
    { lat: 55.3422, lng: -131.6461 },
    { lat: 32.7157, lng: -117.1611 },
    { lat: 61.5815, lng: -149.444 },
    { lat: 60.5544, lng: -151.2583 },
  ]);
  const activePinColor = '#2265EC';
  const inactivePinColor = '#818181';
  const visiblePinsCount = 20;

  // Helper function to update pins
  const updatePins = () => {
    setVisiblePins((current) => {
      const newPins = [...current];
      // Remove 2 random pins
      const pinsToAdd = 4;
      if (newPins.length >= pinsToAdd) {
        for (let i = 0; i < pinsToAdd; i++) {
          const randomIndex = Math.floor(Math.random() * newPins.length);
          newPins.splice(randomIndex, 1);
        }
      }
      // Add 2 new random pins from the main coordinates
      const availablePins = COORDINATES.filter(
        (coord) =>
          !newPins.some(
            (pin) => pin.lat === coord.lat && pin.lng === coord.lng,
          ),
      );
      const newRandomPins = availablePins
        .sort(() => 0.5 - Math.random())
        .slice(0, pinsToAdd);
      return [...newPins, ...newRandomPins].slice(0, visiblePinsCount);
    });
  };

  useEffect(() => {
    // Update pins every 4 seconds
    const interval = setInterval(updatePins, 4000);
    return () => clearInterval(interval);
  }, []);

  const map = useMemo(() => {
    const map = new DottedMap({ map: mapJsonString as any });

    visiblePins.forEach((coord) => {
      map.addPin({
        lat: coord.lat,
        lng: coord.lng,
        svgOptions: { color: activePinColor, radius: 0.3 },
      });
    });

    return map.getSVG({
      radius: 0.2,
      color: inactivePinColor,
      shape: 'circle',
    });
  }, [visiblePins]);

  return (
    <div>
      <img
        loading="lazy"
        alt="World map with active users"
        src={`data:image/svg+xml;utf8,${encodeURIComponent(map)}`}
        className="object-contain w-full h-full"
        width={1200}
        height={630}
      />
    </div>
  );
}
