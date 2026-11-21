// Campaign. Each stage unlocks the next; completing stage N unlocks jets with unlockStage <= N+1.
// groundTargets: { type, count, zone: { dist, angle (deg, 0 = north), radius } }
export const STAGES = [
  {
    id: 1, name: 'Operation Sea Dawn', theater: 'sea', reward: 2500,
    briefing: 'Training sortie turned live. Launch from the CVN Resolute, intercept the enemy recon flight approaching the fleet, then recover aboard the carrier.',
    objectives: ['Catapult launch from the carrier', 'Destroy 3 enemy fighters', 'Land on the carrier (hook + gear down)'],
    wingmen: 1, waves: [{ count: 3, type: 0, dist: 9000, alt: 2500, delay: 0 }],
    groundTargets: [], requireLanding: true,
  },
  {
    id: 2, name: 'Iron Tide', theater: 'sea', reward: 3500,
    briefing: 'An enemy surface action group is moving on the fleet. Sink the frigates. Expect SAM fire from the ships and a fighter escort.',
    objectives: ['Sink 3 enemy frigates', 'Destroy the fighter escort'],
    wingmen: 2, waves: [{ count: 4, type: 0, dist: 11000, alt: 3000, delay: 10 }],
    groundTargets: [{ type: 'frigate', count: 3, zone: { dist: 12000, angle: 20, radius: 1800 } }],
  },
  {
    id: 3, name: 'Coastal Fury', theater: 'coast', reward: 5000,
    briefing: 'Enemy SAM belts protect the coastline. Knock out the SAM sites and the early-warning radar so the invasion fleet can approach.',
    objectives: ['Destroy 4 SAM sites', 'Destroy the radar station', 'Clear enemy fighters'],
    wingmen: 2, waves: [{ count: 3, type: 1, dist: 12000, alt: 3500, delay: 5 }, { count: 2, type: 2, dist: 14000, alt: 4000, delay: 90 }],
    groundTargets: [
      { type: 'sam', count: 4, zone: { dist: 11000, angle: 0, radius: 2500 } },
      { type: 'radar', count: 1, zone: { dist: 13000, angle: 10, radius: 600 } },
    ],
  },
  {
    id: 4, name: 'Green Hell', theater: 'jungle', reward: 6500,
    briefing: 'Insurgent supply depots are hidden beneath the jungle canopy. Take off from Firebase Kestrel, find the fuel depots and silence the AAA.',
    objectives: ['Destroy 5 fuel depots', 'Destroy 4 AAA guns', 'Clear enemy fighters'],
    wingmen: 2, waves: [{ count: 4, type: 2, dist: 12000, alt: 3000, delay: 30 }],
    groundTargets: [
      { type: 'depot', count: 5, zone: { dist: 10000, angle: -25, radius: 2500 } },
      { type: 'aaa', count: 4, zone: { dist: 10000, angle: -25, radius: 2500 } },
    ],
  },
  {
    id: 5, name: 'Thunder Pass', theater: 'mountains', reward: 8000,
    briefing: 'Radar stations on the peaks are guiding enemy interceptors. Fly the valleys under their coverage and destroy every radar. Enemy aces are airborne.',
    objectives: ['Destroy 4 mountain radars', 'Destroy 2 SAM sites', 'Survive the ace squadron'],
    wingmen: 3, waves: [{ count: 4, type: 1, dist: 13000, alt: 4500, delay: 10 }, { count: 2, type: 3, dist: 15000, alt: 5000, delay: 100 }],
    groundTargets: [
      { type: 'radar', count: 4, zone: { dist: 12000, angle: 30, radius: 4000 }, highGround: true },
      { type: 'sam', count: 2, zone: { dist: 11000, angle: 30, radius: 2500 } },
    ],
  },
  {
    id: 6, name: 'Sandstorm Convoy', theater: 'desert', reward: 10000,
    briefing: 'An armored column is racing for the border. Stop the convoy before it escapes. Mobile SAMs and Flanker cover are reported.',
    objectives: ['Destroy the armored convoy (8 vehicles)', 'Destroy 3 SAM sites', 'Clear enemy fighters'],
    wingmen: 3, waves: [{ count: 5, type: 1, dist: 13000, alt: 4000, delay: 20 }, { count: 2, type: 3, dist: 15000, alt: 5000, delay: 120 }],
    groundTargets: [
      { type: 'convoy', count: 8, zone: { dist: 9000, angle: 45, radius: 300 } },
      { type: 'sam', count: 3, zone: { dist: 11000, angle: 45, radius: 3000 } },
    ],
  },
  {
    id: 7, name: 'Frozen Spear', theater: 'arctic', reward: 13000,
    briefing: 'Under the polar sunset, the enemy northern fleet sails with heavy air cover. Sink the destroyer group and break their wing.',
    objectives: ['Sink 4 warships', 'Destroy 8 enemy fighters'],
    wingmen: 3, waves: [{ count: 4, type: 1, dist: 12000, alt: 3000, delay: 0 }, { count: 4, type: 3, dist: 15000, alt: 4500, delay: 80 }],
    groundTargets: [{ type: 'frigate', count: 4, zone: { dist: 13000, angle: -30, radius: 2200 } }],
  },
  {
    id: 8, name: 'Last Light', theater: 'dusk', reward: 20000,
    briefing: 'The enemy command bunker sits in the ridge behind a wall of SAMs, defended by their elite "Black Dragon" squadron. End this war.',
    objectives: ['Destroy the command HQ', 'Destroy 4 SAM sites', 'Defeat the Black Dragon aces'],
    wingmen: 3, waves: [{ count: 4, type: 3, dist: 12000, alt: 4000, delay: 0 }, { count: 4, type: 4, dist: 15000, alt: 5500, delay: 60 }],
    groundTargets: [
      { type: 'hq', count: 1, zone: { dist: 14000, angle: 0, radius: 200 } },
      { type: 'sam', count: 4, zone: { dist: 13000, angle: 0, radius: 2500 } },
      { type: 'aaa', count: 4, zone: { dist: 14000, angle: 0, radius: 1200 } },
    ],
  },
];

export const SKIRMISH_THEATERS = ['sea', 'coast', 'jungle', 'mountains', 'desert', 'arctic', 'dusk'];
