// OWNER: sim-meta. Staff name pools, portrait metadata and fun taglines. (Portrait p12 = Coach Kev, never staff.)

export type PortraitLook = 'f' | 'm' | 'n'
export interface PortraitMeta { id: string; look: PortraitLook; senior?: boolean }

/** Portraits p01–p18 minus Coach Kev (p12), tagged so names fit the face. */
export const STAFF_PORTRAITS: readonly PortraitMeta[] = [
  { id: 'p01', look: 'f' }, { id: 'p02', look: 'n' }, { id: 'p03', look: 'f' }, { id: 'p04', look: 'm', senior: true },
  { id: 'p05', look: 'f' }, { id: 'p06', look: 'm' }, { id: 'p07', look: 'f' }, { id: 'p08', look: 'f', senior: true },
  { id: 'p09', look: 'm' }, { id: 'p10', look: 'n' }, { id: 'p11', look: 'f' }, { id: 'p13', look: 'f', senior: true },
  { id: 'p14', look: 'm' }, { id: 'p15', look: 'f' }, { id: 'p16', look: 'f', senior: true }, { id: 'p17', look: 'f' },
  { id: 'p18', look: 'm' },
]

export const FIRST_NAMES: Record<'f' | 'm' | 'n' | 'fSenior' | 'mSenior', readonly string[]> = {
  f: ['Maya', 'Priya', 'Zoe', 'Aaliyah', 'Chloe', 'Sofia', 'Imani', 'Hana', 'Lucia', 'Amira', 'Jade', 'Nia', 'Leila', 'Mei',
    'Valentina', 'Kiara', 'Freya', 'Yasmin', 'Tessa', 'Noor', 'Ruby', 'Camila', 'Sienna', 'Ava', 'Keisha', 'Ines', 'Luna', 'Paloma'],
  m: ['Marcus', 'Diego', 'Kenji', 'Tariq', 'Leo', 'Andre', 'Omar', 'Mateo', 'Ethan', 'Dev', 'Jamal', 'Nico', 'Hugo', 'Malik',
    'Theo', 'Rafael', 'Kwame', 'Felix', 'Arjun', 'Caleb', 'Tobias', 'Emeka'],
  n: ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Quinn', 'Rowan', 'Skyler', 'Jules', 'Remy', 'Kai', 'Ash', 'Robin', 'Sage', 'Ari', 'Nova'],
  fSenior: ['Gloria', 'Barb', 'Maxine', 'Dolores', 'Beverly', 'Rosa', 'Yvonne', 'Mae', 'Loretta', 'June', 'Pearl', 'Marisol'],
  mSenior: ['Walt', 'Frank', 'Earl', 'Gus', 'Stan', 'Herb', 'Lou', 'Norm', 'Sal', 'Clyde'],
}

export const LAST_NAMES: readonly string[] = [
  'Okafor', 'Nguyen', 'Patel', 'Rivera', 'Kowalski', 'Haddad', 'Johansson', 'Kim', 'Mbeki', 'Castillo', 'Tanaka', 'Moreau',
  'Brooks', 'Delgado', 'Chen', 'Adeyemi', 'Rossi', 'Novak', 'Singh', 'Park', 'Ferreira', 'Walsh', 'Abara', 'Lindqvist',
  'Mendoza', 'Osei', 'Petrov', 'Yamamoto', 'Hughes', 'Bello', 'Duarte', 'Sato', 'Fontaine', 'Ibrahim', 'Reyes', 'Kaur',
  'Obi', 'Vargas', 'Larsen', 'Sharma', 'Mensah', 'Costa', 'Weber', 'Nakamura', 'Quinn', 'Achebe', 'Romero', 'Hale',
]

/** Role-flavoured one-liners (pick deterministically per person for Staff cards). */
export const TAGLINES: Record<string, readonly string[]> = {
  copywriter: [
    'Writes headlines that make grandmas click "Buy now".',
    'Can sell a spatula with a single sentence. Has done it.',
    'Keeps a notebook of 400 banned-in-ads words.',
    'Turned a fridge-magnet listing into a love story.',
    'Thinks in bullet points. Speaks in bullet points.',
    'Ex-greeting-card writer. Emotional damage, weaponised.',
  ],
  video_creator: [
    'Owns four ring lights and zero regular lights.',
    'Can hook you in 1.5 seconds. Timed it.',
    'Films B-roll of everything, including lunch.',
    'Has a green screen in the bathroom. Don\'t ask.',
    'Knows every trending sound before it trends.',
    'Turns unboxings into cinema.',
  ],
  media_buyer: [
    'Dreams in CPMs. Wakes up in ROAS.',
    'Has 14 ad accounts and a spreadsheet for each.',
    'Can smell creative fatigue from across the room.',
    'Once scaled a campaign 10× without breaking it. Once.',
    'Refreshes the ads dashboard like it\'s a slot machine.',
    'Talks to the algorithm like it\'s a moody pet.',
  ],
  researcher: [
    'Has 212 browser tabs open and knows every one.',
    'Spotted fidget spinners six months early.',
    'Reads supplier reviews for fun.',
    'Keeps a spreadsheet of every competitor\'s price.',
    'Found three winning products on page 9 of AliExprez.',
    'Asks "but what\'s the margin?" at birthday parties.',
  ],
  generalist: [
    "Ex-McDoodle's shift lead. Does it all, fries included.",
    'Jack of all trades, master of the group chat.',
    'Can do copy, video and customer service in one afternoon.',
    'Brings snacks. Fixes the Wi-Fi. Writes decent hooks.',
    'Former barista — handles angry customers like a pro.',
    'Learns anything in a weekend. Says "how hard can it be?"',
  ],
  founder: ["Fry cook turned founder. Still smells faintly of fries."],
}
