/**
 * The menu and the neta case, in one table: every item the bar serves and
 * everything kept in the case, with how it is prepared, which hand takes it,
 * how many pieces one block or tray gives, and how it looks.
 *
 * Data only and import-free: src/assets.ts (evaluated by both the app and
 * the editor) and scripts/sync-layout.mjs (which places the case items)
 * both load it on their own. Change the numbers here; run `npm run layout`
 * after changing CASE_ORDER or an item's width.
 */

/** Everything in the neta case (ids are also the Types.Enum values). */
export const Neta = {
  Tamago: 'Tamago',
  Abalone: 'Abalone',
  Octopus: 'Octopus',
  Squid: 'Squid',
  /** The squid's legs (geso), opened flat. */
  Geso: 'Geso',
  Flounder: 'Flounder',
  /** The flounder's fin muscle (縁側), cut off each fillet in the five-piece filleting. */
  Engawa: 'Engawa',
  StripedJack: 'StripedJack',
  Yellowtail: 'Yellowtail',
  /** Bonito back (背), skinned. */
  Bonito: 'Bonito',
  /** Bonito belly (腹), its skin side seared. */
  BonitoBelly: 'BonitoBelly',
  LeanTuna: 'LeanTuna',
  MediumFattyTuna: 'MediumFattyTuna',
  FattyTuna: 'FattyTuna',
  Kohada: 'Kohada',
  HorseMackerel: 'HorseMackerel',
  CuredMackerel: 'CuredMackerel',
  Prawn: 'Prawn',
  SweetShrimp: 'SweetShrimp',
  Scallop: 'Scallop',
  ArkShell: 'ArkShell',
  Cockle: 'Cockle',
  SeaEel: 'SeaEel',
  InariAge: 'InariAge',
  Uni: 'Uni',
  Ikura: 'Ikura',
  TunaStick: 'TunaStick',
  Cucumber: 'Cucumber',
  Kanpyo: 'Kanpyo',
  Takuan: 'Takuan',
  UmePaste: 'UmePaste',
  Shiso: 'Shiso',
} as const;
export type NetaId = (typeof Neta)[keyof typeof Neta];

/**
 * How an item is used: a saku (block) is set on the board and sliced; a
 * piece is taken ready-cut straight onto the fingers; scoop is spooned onto
 * a gunkan; age is the inari pouch; filling goes into a roll.
 */
export type Prep = 'saku' | 'piece' | 'scoop' | 'age' | 'filling';

/**
 * Case shapes (see src/scene-assets/lib/neta-look.ts). saku, tentacle, shell
 * and block are one block sliced on the board; the others show one instance
 * per piece left.
 */
export type CaseShape =
  | 'saku'
  | 'sheet'
  | 'tentacle'
  | 'shell'
  | 'block'
  | 'fillets'
  | 'prawns'
  | 'shrimps'
  | 'halves'
  | 'tongues'
  | 'eels'
  | 'legs'
  | 'pouches'
  | 'urchin'
  | 'roe'
  | 'sticks'
  | 'ribbons'
  | 'paste'
  | 'leaves';

/** Surface pattern painted in vertex colours. */
export type Pattern =
  | 'plain'
  | 'fatLight'
  | 'fatHeavy'
  | 'skinSilver'
  | 'bloodLine'
  | 'yellowLine'
  | 'mackerel'
  | 'spots'
  | 'stripes'
  | 'rim'
  | 'tip'
  | 'glaze'
  | 'layers'
  | 'core';

export interface NetaLook {
  shape: CaseShape;
  /** Main colour, second colour (skin, fat, rim...) as #rrggbb. */
  color: string;
  color2: string;
  pattern: Pattern;
  /** 0 = matt, 1 = wet and glossy. */
  gloss: number;
  /** Slot width along the case (m). */
  width: number;
}

export interface NetaDef {
  /** English name shown in the game. */
  name: string;
  prep: Prep;
  /** Which hand takes it from the case: the neta hand (left) or the rice hand (right). */
  hand: 'neta' | 'rice';
  /** Slices in a full saku, pieces in a tray, servings in a box. */
  stock: number;
  /** Taken per nigiri (sweet shrimp: two). */
  perPiece: number;
  /** A slice shows a skin edge, which belongs on the customer's right. */
  skinEdge: boolean;
  look: NetaLook;
}

const look = (
  shape: CaseShape,
  color: string,
  color2: string,
  pattern: Pattern,
  gloss: number,
  width: number,
): NetaLook => ({ shape, color, color2, pattern, gloss, width });

const def = (
  name: string,
  prep: Prep,
  stock: number,
  l: NetaLook,
  extra: { perPiece?: number; skinEdge?: boolean } = {},
): NetaDef => ({
  name,
  prep,
  hand: prep === 'scoop' || prep === 'filling' ? 'rice' : 'neta',
  stock,
  perPiece: extra.perPiece ?? 1,
  skinEdge: extra.skinEdge ?? false,
  look: l,
});

/** For saku: colour = flesh, colour2 = fat / skin / blood line. For pieces: colour = top, colour2 = underside or detail. */
export const NETA: Record<NetaId, NetaDef> = {
  Tamago: def('Sweet omelette', 'saku', 10, look('block', '#F2C94C', '#9C5A1E', 'layers', 0.2, 0.044)),
  Abalone: def('Abalone', 'saku', 6, look('shell', '#B58E55', '#6E5130', 'rim', 0.6, 0.047)),
  Octopus: def('Octopus', 'saku', 10, look('tentacle', '#8A2E3E', '#F1E4D6', 'plain', 0.5, 0.046)),
  Squid: def('Squid', 'saku', 10, look('sheet', '#F6F3EC', '#E2DED3', 'plain', 0.5, 0.044)),
  Geso: def('Squid legs', 'piece', 6, look('legs', '#EEE3D8', '#C99C8C', 'plain', 0.6, 0.044)),
  Flounder: def('Flounder', 'saku', 16, look('saku', '#F1ECE4', '#EBCDC4', 'plain', 0.75, 0.04)),
  Engawa: def('Flounder fin', 'saku', 8, look('saku', '#F4EADF', '#E6CDBF', 'plain', 0.85, 0.026)),
  StripedJack: def('Striped jack', 'saku', 16, look('saku', '#EED3C6', '#B8C4CC', 'yellowLine', 0.65, 0.04), { skinEdge: true }),
  Yellowtail: def('Young yellowtail', 'saku', 12, look('saku', '#F2CDB9', '#A3313A', 'bloodLine', 0.65, 0.04)),
  Bonito: def('Bonito back', 'saku', 10, look('saku', '#9A2B30', '#6E1A20', 'plain', 0.5, 0.04)),
  BonitoBelly: def('Bonito belly', 'saku', 8, look('saku', '#A8403C', '#2B211C', 'skinSilver', 0.55, 0.04), { skinEdge: true }),
  LeanTuna: def('Lean tuna', 'saku', 15, look('saku', '#B3202C', '#7A1820', 'plain', 0.55, 0.04)),
  MediumFattyTuna: def('Medium fatty tuna', 'saku', 12, look('saku', '#D96B72', '#F6E3DF', 'fatLight', 0.6, 0.04)),
  FattyTuna: def('Fatty tuna', 'saku', 10, look('saku', '#ECAAA8', '#FBF0EC', 'fatHeavy', 0.65, 0.04)),
  Kohada: def('Gizzard shad', 'piece', 8, look('fillets', '#C9D3DB', '#2E3338', 'spots', 0.85, 0.04)),
  HorseMackerel: def('Horse mackerel', 'piece', 4, look('fillets', '#A9B9C6', '#E8B9AE', 'plain', 0.85, 0.04)),
  CuredMackerel: def('Cured mackerel', 'saku', 8, look('saku', '#E8C7BD', '#5E7488', 'mackerel', 0.6, 0.04), { skinEdge: true }),
  Prawn: def('Prawn', 'piece', 4, look('prawns', '#F4EDE6', '#D9472F', 'stripes', 0.4, 0.045)),
  SweetShrimp: def('Sweet shrimp', 'piece', 18, look('shrimps', '#F6A48C', '#F8D3C6', 'plain', 0.85, 0.04), { perPiece: 2 }),
  Scallop: def('Scallop', 'piece', 4, look('halves', '#F3E7D6', '#E6D2B8', 'plain', 0.6, 0.045)),
  ArkShell: def('Ark shell', 'piece', 4, look('tongues', '#E5583E', '#F6C9A8', 'rim', 0.75, 0.046)),
  Cockle: def('Egg cockle', 'piece', 4, look('tongues', '#F0E2CC', '#2C2230', 'tip', 0.6, 0.04)),
  SeaEel: def('Sea eel', 'piece', 8, look('eels', '#8C5A2E', '#E9D6BE', 'glaze', 0.7, 0.046)),
  InariAge: def('Inari pouch', 'age', 12, look('pouches', '#B87A33', '#8E5A22', 'plain', 0.5, 0.05)),
  Uni: def('Sea urchin', 'scoop', 4, look('urchin', '#E89A34', '#E3C99C', 'plain', 0.75, 0.058)),
  Ikura: def('Salmon roe', 'scoop', 4, look('roe', '#F0561C', '#ECE6DA', 'plain', 0.95, 0.058)),
  TunaStick: def('Tuna stick', 'filling', 6, look('sticks', '#B3202C', '#7A1820', 'plain', 0.5, 0.04)),
  Cucumber: def('Cucumber', 'filling', 6, look('sticks', '#2F5B2A', '#D7E8B5', 'core', 0.4, 0.04)),
  Kanpyo: def('Gourd strips', 'filling', 6, look('ribbons', '#A0703A', '#7A5228', 'plain', 0.5, 0.044)),
  Takuan: def('Pickled radish', 'filling', 6, look('sticks', '#F2D23C', '#E8C21E', 'plain', 0.4, 0.04)),
  UmePaste: def('Plum paste', 'filling', 8, look('paste', '#A3242E', '#F1EDE6', 'plain', 0.6, 0.044)),
  Shiso: def('Shiso leaf', 'filling', 10, look('leaves', '#3E7A2E', '#2E5E22', 'plain', 0.3, 0.046)),
};

/**
 * Left to right in the case. The neta hand's items fill the left and the
 * middle (the tuna right in front of the left hand); the rice hand's items
 * the right end. The one place to rearrange the case.
 */
export const CASE_ORDER: readonly NetaId[] = [
  'Tamago', 'Abalone', 'Octopus', 'Squid', 'Geso', 'Flounder', 'Engawa', 'StripedJack', 'Yellowtail', 'Bonito', 'BonitoBelly',
  'LeanTuna', 'MediumFattyTuna', 'FattyTuna',
  'Kohada', 'HorseMackerel', 'CuredMackerel', 'Prawn', 'SweetShrimp', 'Scallop', 'ArkShell', 'Cockle',
  'SeaEel', 'InariAge',
  'Uni', 'Ikura', 'TunaStick', 'Cucumber', 'Kanpyo', 'Takuan', 'UmePaste', 'Shiso',
];

/** Scene node id and asset id of a case item, e.g. case-lean-tuna. */
export function caseAssetId(id: NetaId): string {
  return `case-${id.replace(/[A-Z]/g, (c, i: number) => (i ? '-' : '') + c.toLowerCase())}`;
}

// --- the menu ---

export type PieceKind = 'nigiri' | 'gunkan' | 'inari' | 'maki';

export interface MenuDef {
  /** English name on the order card. */
  name: string;
  kind: PieceKind;
  /** Neta used: the topping, the pouch, or a roll's fillings in placing order. */
  neta: readonly NetaId[];
  /** 'ask': the customer says with or without wasabi; 'never': never wasabi. */
  wasabi: 'ask' | 'never';
  /** Relative order frequency. */
  weight: number;
  /** Pieces one roll is cut into: kanpyo into six, the others into eight. */
  pieces?: 6 | 8;
  /**
   * An order of two pieces, one of each (bonito with no part named: back
   * and belly), served one at a time in either order.
   */
  pair?: readonly MenuId[];
}

export const Menu = {
  LeanTunaNigiri: 'LeanTunaNigiri',
  MediumFattyTunaNigiri: 'MediumFattyTunaNigiri',
  FattyTunaNigiri: 'FattyTunaNigiri',
  /** Bonito with no part named: two pieces, back and belly. */
  BonitoPair: 'BonitoPair',
  BonitoNigiri: 'BonitoNigiri',
  BonitoBellyNigiri: 'BonitoBellyNigiri',
  FlounderNigiri: 'FlounderNigiri',
  EngawaNigiri: 'EngawaNigiri',
  StripedJackNigiri: 'StripedJackNigiri',
  YellowtailNigiri: 'YellowtailNigiri',
  CuredMackerelNigiri: 'CuredMackerelNigiri',
  KohadaNigiri: 'KohadaNigiri',
  HorseMackerelNigiri: 'HorseMackerelNigiri',
  SquidNigiri: 'SquidNigiri',
  GesoNigiri: 'GesoNigiri',
  OctopusNigiri: 'OctopusNigiri',
  PrawnNigiri: 'PrawnNigiri',
  SweetShrimpNigiri: 'SweetShrimpNigiri',
  AbaloneNigiri: 'AbaloneNigiri',
  ArkShellNigiri: 'ArkShellNigiri',
  ScallopNigiri: 'ScallopNigiri',
  CockleNigiri: 'CockleNigiri',
  SeaEelNigiri: 'SeaEelNigiri',
  TamagoNigiri: 'TamagoNigiri',
  UniGunkan: 'UniGunkan',
  IkuraGunkan: 'IkuraGunkan',
  Inari: 'Inari',
  KanpyoRoll: 'KanpyoRoll',
  TunaRoll: 'TunaRoll',
  CucumberRoll: 'CucumberRoll',
  PickleRoll: 'PickleRoll',
  UmeShisoRoll: 'UmeShisoRoll',
  UmeCucumberRoll: 'UmeCucumberRoll',
} as const;
export type MenuId = (typeof Menu)[keyof typeof Menu];

const nigiri = (neta: NetaId, weight = 1, wasabi: 'ask' | 'never' = 'ask'): MenuDef => ({
  name: NETA[neta].name,
  kind: 'nigiri',
  neta: [neta],
  wasabi,
  weight,
});

export const MENU: Record<MenuId, MenuDef> = {
  LeanTunaNigiri: nigiri('LeanTuna', 3),
  MediumFattyTunaNigiri: nigiri('MediumFattyTuna', 2),
  FattyTunaNigiri: nigiri('FattyTuna', 1.5),
  BonitoPair: {
    name: 'Bonito, back and belly',
    kind: 'nigiri',
    neta: ['Bonito', 'BonitoBelly'],
    wasabi: 'ask',
    weight: 1,
    pair: ['BonitoNigiri', 'BonitoBellyNigiri'],
  },
  // One piece, the part named.
  BonitoNigiri: nigiri('Bonito', 0.4),
  BonitoBellyNigiri: nigiri('BonitoBelly', 0.4),
  FlounderNigiri: nigiri('Flounder'),
  EngawaNigiri: nigiri('Engawa', 0.6),
  StripedJackNigiri: nigiri('StripedJack'),
  YellowtailNigiri: nigiri('Yellowtail', 1.5),
  CuredMackerelNigiri: nigiri('CuredMackerel'),
  KohadaNigiri: nigiri('Kohada'),
  HorseMackerelNigiri: nigiri('HorseMackerel'),
  SquidNigiri: nigiri('Squid'),
  GesoNigiri: nigiri('Geso', 0.7),
  OctopusNigiri: nigiri('Octopus'),
  PrawnNigiri: nigiri('Prawn'),
  SweetShrimpNigiri: nigiri('SweetShrimp'),
  AbaloneNigiri: nigiri('Abalone', 0.5),
  ArkShellNigiri: nigiri('ArkShell'),
  ScallopNigiri: nigiri('Scallop'),
  CockleNigiri: nigiri('Cockle', 0.5),
  SeaEelNigiri: nigiri('SeaEel', 1, 'never'),
  TamagoNigiri: nigiri('Tamago', 1, 'never'),
  UniGunkan: { name: 'Sea urchin', kind: 'gunkan', neta: ['Uni'], wasabi: 'ask', weight: 1.5 },
  IkuraGunkan: { name: 'Salmon roe', kind: 'gunkan', neta: ['Ikura'], wasabi: 'ask', weight: 1.5 },
  Inari: { name: 'Inari', kind: 'inari', neta: ['InariAge'], wasabi: 'never', weight: 1 },
  KanpyoRoll: { name: 'Gourd roll', kind: 'maki', neta: ['Kanpyo'], wasabi: 'ask', weight: 1, pieces: 6 },
  TunaRoll: { name: 'Tuna roll', kind: 'maki', neta: ['TunaStick'], wasabi: 'ask', weight: 1.5, pieces: 8 },
  CucumberRoll: { name: 'Cucumber roll', kind: 'maki', neta: ['Cucumber'], wasabi: 'ask', weight: 1, pieces: 8 },
  PickleRoll: { name: 'Pickle roll', kind: 'maki', neta: ['Takuan'], wasabi: 'never', weight: 0.7, pieces: 8 },
  UmeShisoRoll: { name: 'Plum and shiso roll', kind: 'maki', neta: ['Shiso', 'UmePaste'], wasabi: 'never', weight: 0.7, pieces: 8 },
  UmeCucumberRoll: { name: 'Plum and cucumber roll', kind: 'maki', neta: ['UmePaste', 'Cucumber'], wasabi: 'never', weight: 0.7, pieces: 8 },
};

/** True when a piece of `served` fills the order `ordered` (one piece of a pair counts). */
export function orderAccepts(ordered: MenuId, served: MenuId): boolean {
  return ordered === served || !!MENU[ordered].pair?.includes(served);
}

/** What is left of a pair order once one of its pieces is served (null: nothing, it was one piece). */
export function pairRest(ordered: MenuId, served: MenuId): MenuId | null {
  const pair = MENU[ordered].pair;
  return pair?.includes(served) ? (pair.find((id) => id !== served) ?? null) : null;
}

/** The menu item a finished piece is, from its kind and neta (null if none matches). */
export function menuFor(kind: PieceKind, neta: readonly NetaId[]): MenuId | null {
  for (const id of Object.keys(MENU) as MenuId[]) {
    const m = MENU[id];
    if (m.kind === kind && m.neta.length === neta.length && m.neta.every((n, i) => n === neta[i])) return id;
  }
  return null;
}

/**
 * The menu board (お品書き) high on the back wall, read right to left: one
 * wooden plaque per item, its name in Japanese (the one place with Japanese
 * text, the shop owner's choice) over its price from src/tuning.ts. The
 * bonito's plaque shows the price of one piece, back or belly.
 */
export const MENU_BOARD: ReadonlyArray<{ ja: string; item: MenuId }> = [
  { ja: '大とろ', item: 'FattyTunaNigiri' },
  { ja: '中とろ', item: 'MediumFattyTunaNigiri' },
  { ja: '赤身', item: 'LeanTunaNigiri' },
  { ja: '平目', item: 'FlounderNigiri' },
  { ja: 'えんがわ', item: 'EngawaNigiri' },
  { ja: 'しまあじ', item: 'StripedJackNigiri' },
  { ja: 'はまち', item: 'YellowtailNigiri' },
  { ja: 'かつお', item: 'BonitoNigiri' },
  { ja: 'こはだ', item: 'KohadaNigiri' },
  { ja: 'あじ', item: 'HorseMackerelNigiri' },
  { ja: 'しめさば', item: 'CuredMackerelNigiri' },
  { ja: 'いか', item: 'SquidNigiri' },
  { ja: 'げそ', item: 'GesoNigiri' },
  { ja: 'たこ', item: 'OctopusNigiri' },
  { ja: '車海老', item: 'PrawnNigiri' },
  { ja: '甘海老', item: 'SweetShrimpNigiri' },
  { ja: '帆立', item: 'ScallopNigiri' },
  { ja: '赤貝', item: 'ArkShellNigiri' },
  { ja: 'とり貝', item: 'CockleNigiri' },
  { ja: 'あわび', item: 'AbaloneNigiri' },
  { ja: '穴子', item: 'SeaEelNigiri' },
  { ja: '玉子', item: 'TamagoNigiri' },
  { ja: 'うに', item: 'UniGunkan' },
  { ja: 'いくら', item: 'IkuraGunkan' },
  { ja: 'いなり', item: 'Inari' },
  { ja: '鉄火巻', item: 'TunaRoll' },
  { ja: 'かっぱ巻', item: 'CucumberRoll' },
  { ja: 'かんぴょう巻', item: 'KanpyoRoll' },
  { ja: 'おしんこ巻', item: 'PickleRoll' },
  { ja: '梅しそ巻', item: 'UmeShisoRoll' },
  { ja: '梅きゅう巻', item: 'UmeCucumberRoll' },
];
