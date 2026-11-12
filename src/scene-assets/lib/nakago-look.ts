import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';

/** The floor's thickness: what comes in an insert or in the pack rests this high above its origin. */
export const NAKAGO_FLOOR = 0.004;
export const NAKAGO_LENGTH = 0.17;
export const NAKAGO_WIDTH = 0.13;
export const NAKAGO_HEIGHT = 0.05;
export const PACK_LENGTH = 0.24;
export const PACK_WIDTH = 0.13;
export const PACK_HEIGHT = 0.03;

const steel = new MeshStandardMaterial({ color: '#C8CBCF', metalness: 0.85, roughness: 0.3 });
const foam = new MeshStandardMaterial({ color: '#F3F3EF', roughness: 0.9 });

/**
 * A nakago (中子): the stainless insert pan the fish shop delivers a prepared
 * ingredient in (the octopus, the abalone, the gourd strips; the user's shop).
 * Origin at the underside's middle, long along X, open on top, the floor's
 * top at NAKAGO_FLOOR; a rolled lip round the rim. Emptied into its pot, it is
 * washed and dried at the sink and stacked upside down on the sink's end.
 */
export function createNakago(): Group {
  const root = new Group();
  root.name = 'Nakago';
  const L = NAKAGO_LENGTH;
  const W = NAKAGO_WIDTH;
  const H = NAKAGO_HEIGHT;
  const t = 0.0025;
  const floor = new Mesh(new BoxGeometry(L, NAKAGO_FLOOR, W), steel);
  floor.name = 'Floor';
  floor.position.y = NAKAGO_FLOOR / 2;
  root.add(floor);
  const walls: Array<[BoxGeometry, number, number]> = [
    [new BoxGeometry(L, H, t), 0, (W - t) / 2],
    [new BoxGeometry(L, H, t), 0, -(W - t) / 2],
    [new BoxGeometry(t, H, W), (L - t) / 2, 0],
    [new BoxGeometry(t, H, W), -(L - t) / 2, 0],
  ];
  walls.forEach(([g, x, z], k) => {
    const wall = new Mesh(g, steel);
    wall.name = `Wall${k}`;
    wall.position.set(x, H / 2, z);
    root.add(wall);
  });
  // The lip: four bars round the top edge, standing a little proud of the walls.
  const lip = new Group();
  lip.name = 'Lip';
  const o = 0.005;
  const bars: Array<[BoxGeometry, number, number]> = [
    [new BoxGeometry(L + 2 * o, 0.004, o + t), 0, (W + o) / 2],
    [new BoxGeometry(L + 2 * o, 0.004, o + t), 0, -(W + o) / 2],
    [new BoxGeometry(o + t, 0.004, W + 2 * o), (L + o) / 2, 0],
    [new BoxGeometry(o + t, 0.004, W + 2 * o), -(L + o) / 2, 0],
  ];
  bars.forEach(([g, x, z], k) => {
    const bar = new Mesh(g, steel);
    bar.name = `Bar${k}`;
    bar.position.set(x, H - 0.002, z);
    lip.add(bar);
  });
  root.add(lip);
  return root;
}

/**
 * The anago's pack (the user's shop: 「パックに入って開いてあるやつを買えばいい」):
 * a white foam tray the two opened eels lie in. Origin at the underside's
 * middle, long along X, the floor's top at NAKAGO_FLOOR, the walls flared a
 * little outward, a flat flange round the top. Emptied into its pot, it goes
 * in the trash, not the sink.
 */
export function createPack(): Group {
  const root = new Group();
  root.name = 'Pack';
  const L = PACK_LENGTH;
  const W = PACK_WIDTH;
  const H = PACK_HEIGHT;
  const t = 0.003;
  const flare = 0.2;
  const floor = new Mesh(new BoxGeometry(L, NAKAGO_FLOOR, W), foam);
  floor.name = 'Floor';
  floor.position.y = NAKAGO_FLOOR / 2;
  root.add(floor);
  // Each wall pivots on its bottom edge at the floor's rim and leans outward.
  const walls: Array<[BoxGeometry, number, number, number, number]> = [
    [new BoxGeometry(L, H, t).translate(0, H / 2, 0), 0, (W - t) / 2, flare, 0],
    [new BoxGeometry(L, H, t).translate(0, H / 2, 0), 0, -(W - t) / 2, -flare, 0],
    [new BoxGeometry(t, H, W).translate(0, H / 2, 0), (L - t) / 2, 0, 0, -flare],
    [new BoxGeometry(t, H, W).translate(0, H / 2, 0), -(L - t) / 2, 0, 0, flare],
  ];
  walls.forEach(([g, x, z, rx, rz], k) => {
    const wall = new Mesh(g, foam);
    wall.name = `Wall${k}`;
    wall.position.set(x, NAKAGO_FLOOR, z);
    wall.rotation.set(rx, 0, rz);
    root.add(wall);
  });
  // The flange: a flat band round the top, out past the leaning walls.
  const rim = new Group();
  rim.name = 'Rim';
  const out = H * Math.sin(flare);
  const f = 0.012;
  const bars: Array<[BoxGeometry, number, number]> = [
    [new BoxGeometry(L + 2 * (out + f), 0.003, f), 0, W / 2 + out + f / 2],
    [new BoxGeometry(L + 2 * (out + f), 0.003, f), 0, -(W / 2 + out + f / 2)],
    [new BoxGeometry(f, 0.003, W + 2 * out), L / 2 + out + f / 2, 0],
    [new BoxGeometry(f, 0.003, W + 2 * out), -(L / 2 + out + f / 2), 0],
  ];
  bars.forEach(([g, x, z], k) => {
    const bar = new Mesh(g, foam);
    bar.name = `Bar${k}`;
    bar.position.set(x, NAKAGO_FLOOR + H * Math.cos(flare), z);
    rim.add(bar);
  });
  root.add(rim);
  return root;
}

export const DRY_CLOTH_WIDTH = 0.12;
export const DRY_CLOTH_DROP = 0.15;

const linen = new MeshStandardMaterial({ color: '#EFE9DA', roughness: 0.95 });

/**
 * The dry cloth (布巾) that hangs folded over the sink's front edge, for
 * drying a washed insert (the user's shop: used, washed and the water off
 * is clean). Origin at the edge's top, the cloth's middle: a strip lies on
 * the top (+Z), the rest hangs down the front (−Z).
 */
export function createDryCloth(): Group {
  const root = new Group();
  root.name = 'DryCloth';
  const top = new Mesh(new BoxGeometry(DRY_CLOTH_WIDTH, 0.01, 0.05), linen);
  top.name = 'Top';
  top.position.set(0, 0.005, 0.025);
  const fold = new Mesh(new BoxGeometry(DRY_CLOTH_WIDTH, 0.014, 0.014), linen);
  fold.name = 'Fold';
  fold.position.set(0, 0.003, -0.003);
  const flap = new Mesh(new BoxGeometry(DRY_CLOTH_WIDTH, DRY_CLOTH_DROP, 0.01), linen);
  flap.name = 'Flap';
  flap.position.set(0, -DRY_CLOTH_DROP / 2, -0.005);
  root.add(top, fold, flap);
  return root;
}

/** For the asset preview: an insert, the pack and the cloth side by side. */
export function createNakagoPreview(): Group {
  const root = new Group();
  root.name = 'NakagoPreview';
  const pan = createNakago();
  pan.position.x = -0.22;
  const pack = createPack();
  pack.position.x = 0.06;
  const cloth = createDryCloth();
  cloth.position.set(0.3, DRY_CLOTH_DROP, 0);
  root.add(pan, pack, cloth);
  return root;
}
