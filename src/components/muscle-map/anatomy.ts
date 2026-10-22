/**
 * ASTNUM master anatomy — v7 ("living statue" pass).
 *
 * Redrawn from anatomical reference (surface myology à la Netter, adapted to
 * the Strong/Hevy symmetric heat-map plate architecture). Every path is a
 * hand-crafted cubic-bézier "ink" drawing of the RIGHT half in front space;
 * the left half is an exact numeric mirror (x' = 2·axis − x) so the figure
 * is perfectly symmetric like the premium plate maps it imitates.
 *
 * Proportions — 7.8-head athletic figure (head h = 51):
 *   crown 8 · chin 59 · acromion 86 · clavicle 89–96 · navel 158
 *   crotch 204 · knee 303 · calf peak 322 · ankle 380 · sole 405
 *   delt span ≈ 2.3 head-widths · waist:shoulder ≈ 0.83 (V-taper)
 *
 * Upgrades over v6 ("living statue" — user: طور شكل الجسم و تفاصيله أكثر):
 *   - FRONT trapezius plate: the neck→acromion slope is now a real,
 *     clickable trap wedge (same svgId "upper_back" as the back diamond) so
 *     the formerly dead neck-shoulder gap reads as anatomy and logs data
 *   - abs plate extended with the external-oblique flanks (one path, two
 *     subpaths): the full core — rectus column + oblique mass — shares the
 *     "abs" data muscle; their shared stroke becomes the semilunar line
 *   - the head is no longer a bald egg: brow, closed eyes, nose midline,
 *     mouth, ears, hairline, under-jaw crease, sternal notch (subtle statue
 *     ink — never cartoony)
 *   - hands/feet read as anatomy: knuckle row + finger separators, toe
 *     separators + arch lines
 *   - richer muscle texture: pec striation fans, trap fiber arcs (front),
 *     upper-trap fibers + infraspinatus texture (back), oblique finger
 *     hints, TFL/abductor line, patellar tendon, fibula line, lower linea
 *     alba, biceps-femoris short-head split, soleus sweep
 *   - badge anchors can be overridden per view (front traps badge sits on
 *     the slope, not on the back-diamond center)
 *
 * Kept from v6: pectoral fan, deltoid heads, six-pack cuts, quad sweep,
 * trap diamond, lat wings, triceps horseshoe, glute fold, calf diamond.
 *
 * All landmarks live in FRONT space (axis x=60); the back view is the same
 * body shifted +120 (BACK_AXIS = 180). Figure spans x 16..104, y 8..405.
 */

export type Pt = readonly [number, number];

/* ── path mirroring (exact, numeric) ─────────────────────────── */

/**
 * Transform every coordinate of an SVG path string by walking its commands.
 * Supports M/L/C/Q/T/H/V/Z (absolute — the only commands used here). fx is
 * applied to every x coordinate, fy to every y coordinate.
 */
function transformD(
  d: string,
  fx: (x: number) => number,
  fy: (y: number) => number = (y) => y
): string {
  return d.replace(/([A-Za-z])[ \t\n\r]*([^A-Za-z]*)/g, (_m, letter: string, args: string) => {
    const nums = args.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length === 0) return letter;
    const L = letter.toUpperCase();
    if (L === "Z") return letter;
    if (L === "H") return letter + nums.map((n) => fx(parseFloat(n)).toFixed(2)).join(",");
    if (L === "V") return letter + nums.map((n) => fy(parseFloat(n)).toFixed(2)).join(",");
    return (
      letter +
      nums
        .map((n, i) =>
          i % 2 === 0
            ? fx(parseFloat(n)).toFixed(2)
            : fy(parseFloat(n)).toFixed(2)
        )
        .join(",")
    );
  });
}

/**
 * Mirror every x coordinate of an SVG path string around a vertical axis.
 */
export function mirrorD(d: string, axis: number): string {
  return transformD(d, (x) => 2 * axis - x);
}

/** Shift a path by (dx, dy) — used to build the back view from front space. */
export function shiftD(d: string, dx: number, dy = 0): string {
  return dy === 0
    ? transformD(d, (x) => x + dx)
    : transformD(d, (x) => x + dx, (y) => y + dy);
}

export const FRONT_AXIS = 60;
export const BACK_AXIS = 180;
const BACK_SHIFT = BACK_AXIS - FRONT_AXIS;

/* ── TORSO + LEGS SILHOUETTE (front space, right half) ───────── */

/**
 * One continuous inked contour, crown → skull → jaw → neck → trapezius slope
 * → deltoid cap → armpit → serratus/ribs → waist pinch → hip flare → thigh
 * sweep → knee → calf → ankle → foot → inner leg (with medial-gastrocnemius
 * bulge) → crotch center. The closing Z runs up the centerline (degenerate,
 * invisible). The arm is a separate path rendered on top.
 */
const TORSO_D = `
M 60,8
C 68.6,8.7 74.2,14.4 76.1,23.6
C 77.6,31.2 76.9,40 74.6,47
C 72.7,52.6 68.9,57.6 62.8,59.2
C 64.1,61.8 64.9,63.9 64.8,66.4
C 65.2,69.8 66.7,72.2 69.5,74.2
C 76.4,78.2 86,82.6 94.4,86.6
C 98.6,89.4 101,93.8 101.3,99.2
C 101.5,103.8 99.5,107.8 96.6,110.6
C 93.8,113 90.9,115.6 88.6,118.6
C 87,127 85.6,138 85.2,147.4
C 84.8,152.2 84.4,155 84.6,158.2
C 85.2,165.4 87.2,171.6 88.6,177.4
C 89.8,182.4 90.6,187.6 90.6,192.6
C 90.6,197 90.2,201.4 89.4,206
C 88.4,213.8 87.4,222.8 86.2,232.6
C 85,243.4 83.4,254.8 81.4,265.6
C 79.4,276.4 77.2,286.6 75.6,295.2
C 74.9,299 74.6,302.4 74.9,305.4
C 75.4,310.8 76.4,317.2 76.6,323.6
C 76.7,331 75.9,338.6 74.2,346.2
C 72.8,352.6 71.1,358.8 69.6,364.8
C 68.5,369.4 67.9,374.4 67.8,379.2
C 67.7,382.8 67.5,386 67.2,388.6
C 66.6,392.6 65.9,396.4 65,399.2
C 63.6,402.8 61.9,404.8 59.6,405.1
C 58.3,405.2 57.5,403.9 57.7,401.9
C 58.3,398.3 59.4,394.8 60.3,391
C 61.2,386.6 61.9,381.2 62.5,375.2
C 63.2,368.4 63.7,361.4 64.2,354.6
C 64.6,347.4 64.4,340.4 63.7,332.6
C 63.1,326.4 63,318.4 63.3,311
C 63.7,306.2 64.4,303.2 65.1,302.2
C 65.3,302.3 65.6,302.4 65.7,302.4
C 65.7,297.8 65.4,293.4 64.8,289.4
C 64,283.8 63.5,278 63.3,272
C 63,264.8 63.1,257.4 63.6,250.4
C 64,243.2 64.3,235.8 64.2,228.8
C 64.1,223.4 63.8,218 63.2,213
C 62.8,209.8 62.2,207.2 61.4,205.4
C 60.9,204.3 60.5,203.4 60,203.4 Z`;

export const SILHOUETTE_D = {
  front: `${TORSO_D} ${mirrorD(TORSO_D, FRONT_AXIS)}`,
  back: `${shiftD(TORSO_D, BACK_SHIFT)} ${mirrorD(shiftD(TORSO_D, BACK_SHIFT), BACK_AXIS)}`,
} as const;

/* ── ARM (separate path rendered on top of the shoulder) ─────── */

/**
 * Relaxed arm, ~8° outward. Its outer contour runs 0.5–1 unit lateral of the
 * torso cap so the pair reads as a rim-lighted shoulder; the closing chord
 * from the armpit up to the cap top is the deltopectoral groove (front) /
 * rear-delt medial crease (back).
 */
const ARM_D_PATH = `
M 95.2,88.2
C 98.8,90.4 101.5,94.4 101.7,99.4
C 101.9,103.6 100.5,107.4 98.2,110.4
C 97.4,116.4 96.6,123.8 96,131.6
C 95.4,138.8 94.8,145.4 94.5,151.4
C 94.3,154.4 94.5,157 95.1,159.4
C 95.9,162.8 96.7,166.6 97,171
C 97.3,176.8 96.5,182.8 95.3,188.4
C 94.3,193.2 93.4,197.6 92.8,201.4
C 92.4,204.6 92.4,208.2 91.7,211.6
C 90.9,215.4 89.5,218.4 86.9,219.6
C 84.7,220.6 83,219.6 83.2,217
C 83.4,213 84.8,208.8 85.8,205.2
C 86.2,203.8 86.3,202.6 86.4,201.6
C 85.7,197.8 85.2,193.6 85,189.4
C 84.8,184.8 85.2,180 86,175.4
C 86.5,171.6 87.3,167 88,162
C 88.1,161 88,160 87.8,159.2
C 87.6,156.6 87.5,154 87.5,151.4
C 87.4,145.2 87.2,138.6 87.3,131.4
C 87.4,126.4 88.2,121.8 89.2,117.6
C 89.4,115.8 89.5,114 89.6,112.4
C 91.2,104.4 93,96.2 95.2,88.2 Z`;

export const ARM_D = {
  front: `${ARM_D_PATH} ${mirrorD(ARM_D_PATH, FRONT_AXIS)}`,
  back: `${shiftD(ARM_D_PATH, BACK_SHIFT)} ${mirrorD(shiftD(ARM_D_PATH, BACK_SHIFT), BACK_AXIS)}`,
} as const;

/* ── FRONT MUSCLE PLATES (front space, right half) ───────────── */

/**
 * Pectoralis major — the fan: clavicular origin follows the clavicle, sternal
 * border drops along the sternum with a subtle S, the lower border sweeps
 * steeply from the armpit insertion down to the sternum (the classic
 * infero-lateral rake forms a clear "smile" across the two pecs), lateral
 * border lies just medial to the deltopectoral groove.
 */
const CHEST = `
M 61.7,94.2
C 63.6,92.4 66.2,91.3 69,90.7
C 76.6,89.4 84.4,89.3 89.6,90.9
C 90.9,91.6 91.9,93.3 91.9,95.4
C 91.6,100.9 90.6,104.9 89.4,107.6
C 86.4,109.8 82,112.4 77.6,114.4
C 71.6,117.6 65.8,120.2 61.9,122.2
C 61.4,117 61.1,110.6 61.2,104
C 61.3,100.2 61.5,97 61.7,94.2 Z`;

/**
 * Anterior deltoid — a confident wedge under the lateral clavicle, rendered
 * OVER the pec's upper-outer corner (correct anatomy: the delt passes in
 * front of the clavicular pec). Lateral border shared with the side delt's
 * medial border; medial border follows the deltopectoral groove.
 */
const FRONT_DELTS = `
M 86.6,90.6
C 89.8,90.2 93,91 94.6,92.4
C 95.2,94.2 95.4,97 95.4,100
C 95.3,102 95.3,104 95.2,105.8
C 93.6,106.8 91.4,106.4 89.6,105.4
C 88.6,102.2 88,99 87.6,96.2
C 87.5,94.2 87,92 86.6,90.6 Z`;

/**
 * Lateral deltoid — the cannonball outer cap: hugs the shoulder silhouette
 * rim, medial border shared with the anterior delt (clean seam, no overlap).
 */
const SIDE_DELTS = `
M 94.6,92.4
C 97.2,92.6 100.2,94.6 101.2,98.2
C 101.8,101.2 101,104.4 99.4,106.4
C 98,107.8 96,107.4 95,106.2
C 95.4,103 95.4,99.2 94.6,92.4 Z`;

/**
 * Anterior trapezius (front slope) — the wedge from the neck junction to the
 * acromion, sitting ABOVE the clavicle bone line. Rendered in the FRONT view
 * under the same svgId "upper_back" as the back diamond: traps are visible
 * from the front, clicking them opens the real upper-back data muscle, and
 * the formerly dead neck-shoulder gap now reads as anatomy. The SCM seam
 * stroke (drawn in the ink layer above) carves the medial border, exactly
 * like the layered surface myology it imitates.
 */
const FRONT_TRAPS = `
M 64.9,70.1
C 67.4,72.9 70.8,75.3 74.8,77.5
C 79.4,79.9 84,82.5 88.4,85.1
C 91.4,86.5 93.6,87.3 94.3,87.7
C 91.6,88.4 87.8,89 84,89.6
C 78,90.5 71.6,89.9 67.2,88.8
C 64.6,88.1 62.7,86.9 61.9,85.4
C 62.6,80.6 63.6,75.4 64.9,70.1 Z`;

/** Biceps brachii — high spindle, belly biased to the inner (short) head. */
const BICEPS = `
M 90.6,121.4
C 92.8,119 94.6,118.9 95.6,121.4
C 96.6,124.4 96.8,129 96.2,133.6
C 95.6,138.4 94.6,142.8 93,146.4
C 92,148.4 91,149.6 90,150
C 89.2,146.4 88.8,142.2 88.6,137.6
C 88.4,133 88.8,128.2 89.6,124
C 89.8,123 90.2,122.2 90.6,121.4 Z`;

/** Forearm mass — brachioradialis bulge high, long flexor taper to wrist. */
const FOREARMS = `
M 86.8,161.8
C 89,160.4 91.4,160.2 93.4,161.4
C 95.4,163 96,165.8 95.8,169.4
C 95.4,175.6 94.2,183 92.8,189.6
C 92,193 91.2,196 90.6,198.6
C 89.2,198 88.2,195.8 87.4,193
C 86.4,188.6 85.8,183.4 86,178.2
C 86.2,172.4 86.4,166.6 86.8,161.8 Z`;

/**
 * Rectus abdominis — costal width, linea-alba medial border, pubic taper.
 * v7: the path now carries TWO subpaths — the rectus column AND the
 * external-oblique flank (ribs → waist pinch → iliac crest → inguinal
 * sweep). Both share the "abs" data muscle: the plate's own body-toned
 * stroke draws the semilunar line where they meet, and the oblique finger
 * seams (below) add the interdigitated look of real surface myology.
 */
const ABS_RECTUS = `
M 61.5,124.4
C 66,123 71,122.8 75.4,123.6
C 77.2,127.8 78,133.6 78.2,140.8
C 78.4,147.6 77.6,153.6 76.2,158.6
C 74.6,163.8 72.8,168.4 70.6,172.6
C 68.6,176.2 66.4,179 63.8,180.6
C 61.9,176.6 61.6,168 61.5,156.6
C 61.5,146 61.5,134.6 61.5,124.4 Z`;

/** External-oblique flank (right side) — hugs the waist silhouette. */
const ABS_OBLIQUES = `
M 76.8,125.4
C 80.8,126.8 83.6,129.6 85,133.8
C 85.9,138.4 84.9,144.4 84.2,150.2
C 83.8,156.4 84.2,164.6 84.8,172.6
C 85.3,180.8 86.4,189.6 88,196.4
C 85.6,199 82.4,200.4 79.6,200.2
C 76.6,199.8 73.6,198.6 71.5,196.8
C 69.9,191.8 69.5,186 69.8,180.2
C 71.4,174.2 73.6,166.6 76.6,159.4
C 79,153 79.8,144.8 79.3,138.6
C 79,133.6 77.9,128.6 76.8,125.4 Z`;

const ABS = `${ABS_RECTUS} ${ABS_OBLIQUES}`;

/**
 * Quadriceps — outer vastus-lateralis sweep hugging the thigh, inner border
 * with the vastus-medialis teardrop above the knee; rectus-femoris column is
 * inked as detail grooves.
 */
const QUADS = `
M 61.8,214.6
C 66,212.8 70.6,212.6 74.8,214
C 78.6,216 81,219.4 82,224.2
C 83.2,230.6 83.8,238.4 83.2,246.2
C 82.6,254.8 80.6,264 78.4,272.4
C 76.2,280.6 74,288.2 71.8,294.2
C 70.6,297.2 69.8,299.8 69.4,301.6
C 68.8,303.4 68,304.2 67,303.4
C 65.8,302.4 65.2,299.8 65.4,296.8
C 65.6,292.8 66,288.6 65.4,284.8
C 64.8,278.4 64.2,270.6 63.8,262
C 63.4,253 63.4,243.4 63.8,234.8
C 64,227.8 63.2,220.4 61.8,214.6 Z`;

/* ── BACK MUSCLE PLATES (front space, right half — shifted +120) ── */

/**
 * Trapezius — the kite: apex high at the skull base (visible column beside
 * the neck), wide over the shoulder caps, diamond converging to T12. The
 * lower-fiber rake is inked as a seam stroke inside the plate.
 */
const UPPER_BACK = `
M 60.3,62.8
C 66.8,64.6 74.6,68 81.8,72.8
C 86.6,75.6 90.2,79 92.2,82.8
C 94,86.4 93.6,90.2 92,93.2
C 88.8,97.8 84.8,101.8 80.2,105.8
C 74.8,110.8 68.8,116.8 63.6,122.6
C 62.2,130.4 61.4,138.2 60.3,144.6
C 60.3,116.6 60.3,89.8 60.3,62.8 Z`;

/**
 * Latissimus dorsi — the wing: broad spine origin, slow outer taper from the
 * armpit (real wing flare, not a scapular sliver), converging to the lumbar V.
 */
const LATS = `
M 60.9,126.4
C 70.6,119.8 80.8,113 89.8,107.2
C 91,112 91.4,118.6 90.6,125.6
C 89.8,132.6 88.4,140 86.2,147.2
C 82.8,156.6 78.2,164.8 72.4,171.2
C 69.2,174.2 65.8,176.2 62.2,177.2
C 61.2,167.6 61,147.6 61,137.6
C 60.9,134 60.9,130.4 60.9,126.4 Z`;

/** Posterior deltoid — crescent cap behind the shoulder, over the triceps. */
const REAR_DELTS = `
M 93,91.2
C 96,90 99.2,92.2 100.5,95.8
C 101,99 100.6,102.4 99,105
C 97.4,107.6 95.4,108 94,107
C 94.6,103.8 94.9,100.2 94.7,96.8
C 94.4,94.6 93.8,92.8 93,91.2 Z`;

/** Triceps brachii — lateral + long head masses into the horseshoe. */
const TRICEPS = `
M 91.2,123.8
C 93,121 94.8,120.8 95.8,122.6
C 96.8,124.6 97,128.4 96.4,132.6
C 95.8,137.4 94.8,141.8 93.4,145.4
C 92.4,147.8 91.4,149.2 90.4,149.6
C 89.8,146.4 89.4,142.6 89.2,138.4
C 89,133.6 89.2,128.4 89.8,124.6
C 90.2,123.8 90.7,123.4 91.2,123.8 Z`;

/**
 * Erector spinae — full twin columns beside the spine: visible below the trap
 * diamond, widening through the lumbar belly, tapering into the sacrum.
 */
const LOWER_BACK = `
M 60.6,147.8
C 63.6,147.2 66.4,148.4 68,151.2
C 69.6,156.2 70.2,164.2 69.2,172
C 68.4,179.4 66.4,186.8 64,193.2
C 62.8,196 61.7,198.4 60.7,200.4
C 60.4,190.6 60.2,176.4 60.2,164
C 60.3,157.8 60.4,151.8 60.6,147.8 Z`;

/** Gluteus maximus — rounded mass, gluteal-fold lower border, sacral medial. */
const GLUTES = `
M 61.2,192.4
C 66,192 71.4,193.4 76.4,196.6
C 79.8,198.8 82.1,202 82.7,206.4
C 83.3,211 82.4,216.4 80,220.6
C 77.6,224.4 74.2,226.6 70.4,227.4
C 67,228 64.2,227 61.8,225.4
C 61.4,214.4 61.2,203.4 61.2,192.4 Z`;

/** Hamstrings — biceps-femoris outer + semitendinosus inner to the knee. */
const HAMSTRINGS = `
M 61.8,230.4
C 66.4,228.6 71.4,229.6 74.8,232.8
C 77.4,236.4 78.2,242 77.6,248.6
C 76.8,257 75.2,265.6 72.8,273.6
C 70.8,280.4 68.6,286.8 66.4,292
C 64.8,295.4 63.4,297.6 62.2,298.4
C 63.2,292 63.9,284.4 63.8,275.6
C 63.7,267.6 63.4,258.6 63.2,249.6
C 63,243.2 62.6,236.4 61.8,230.4 Z`;

/**
 * Gastrocnemius — the diamond: wide two-headed origin under the knee back,
 * big lateral head, medial head bulging low toward the inner silhouette,
 * converging into the Achilles taper (which stays above the ankle).
 */
const CALVES = `
M 63.4,307.8
C 65.8,305.8 68.6,305.4 70.8,307
C 72.6,309.8 73.6,314.4 73.2,320
C 72.8,325.6 71.6,331.2 69.4,335.8
C 68.2,340.4 66.6,344.2 65.4,347.2
C 65,348.4 64.6,349 64.2,349.2
C 64.3,344.6 64,339.4 63.9,334.2
C 63.8,329.8 64,324 64.4,318
C 64.7,313.8 64.4,310.2 63.4,307.8 Z`;

/* ── region tables (render order matters: later = on top) ─────── */

export interface AnatomyRegion {
  svgId: string;
  d: string;
}

const FRONT_SETS: Array<[string, string]> = [
  ["quads", QUADS],
  ["forearms", FOREARMS],
  ["abs", ABS],
  ["upper_back", FRONT_TRAPS],
  ["biceps", BICEPS],
  ["chest", CHEST],
  ["front_delts", FRONT_DELTS],
  ["side_delts", SIDE_DELTS],
];

/** back stacking: hams/calves under everything, traps on top of lats */
const BACK_SETS: Array<[string, string]> = [
  ["hamstrings", HAMSTRINGS],
  ["calves", CALVES],
  ["lower_back", LOWER_BACK],
  ["glutes", GLUTES],
  ["lats", LATS],
  ["triceps", TRICEPS],
  ["forearms", FOREARMS],
  ["rear_delts", REAR_DELTS],
  ["upper_back", UPPER_BACK],
];

/** right-half plate + its exact mirror around the view axis. */
function pair(d: string, axis: number): string {
  return `${d} ${mirrorD(d, axis)}`;
}

export const FRONT_REGIONS: readonly AnatomyRegion[] = FRONT_SETS.map(
  ([svgId, d]) => ({ svgId, d: pair(d, FRONT_AXIS) })
);

export const BACK_REGIONS: readonly AnatomyRegion[] = BACK_SETS.map(
  ([svgId, d]) => ({ svgId, d: pair(shiftD(d, BACK_SHIFT), BACK_AXIS) })
);

/* ── anatomical detail strokes (subtle, non-interactive) ──────── */

/**
 * Right-half strokes are mirrored automatically. `center: true` strokes sit
 * exactly on the centerline (x = 60) so their mirror is themselves and they
 * ink only once (spine, sternum, navel, sacrum).
 */
interface DetailPath {
  d: string;
  /** authored exactly on x=60 — inks once (spine, sternum, navel, sacrum) */
  center?: boolean;
  /** fiber-separation seam — drawn in body tone over the plates (readable
   *  anatomy like abs cuts / quad grooves), vs the default soft ink line */
  seam?: boolean;
}

export interface BuiltDetail {
  d: string;
  seam: boolean;
}

const FRONT_DETAIL_SET: readonly DetailPath[] = [
  // ── head (v7 "living statue" ink: subtle, never cartoony) ──
  // hairline — short athletic cut, swept across the upper skull
  { d: `M 60.2,31.4 C 65.6,29.8 70.8,30.4 74.6,33.4` },
  // brow ridge
  { d: `M 66.6,33.8 C 68.6,32.6 70.8,32.6 72.6,33.8` },
  // closed eye (calm statue gaze)
  { d: `M 67,37.6 C 68.6,36.6 70.4,36.6 72,37.6` },
  // nose midline (center — inks once)
  { d: `M 60.4,38.4 C 60.8,41 61.2,43.8 60.9,46.8`, center: true },
  // mouth (center — slightly wider so it survives small scales)
  { d: `M 58.5,50.8 C 59.2,52 60.8,52 61.5,50.8`, center: true },
  // ear — attached near the skull rim (larger arc reads at small sizes)
  { d: `M 75.2,35.4 C 76.9,37 77.2,40.4 76,43` },
  // under-jaw crease (center)
  { d: `M 58.8,60.8 C 59.4,62 60.6,62 61.2,60.8`, center: true },
  // sternal notch (center)
  { d: `M 58.7,89.6 C 59.3,88.7 60.7,88.7 61.3,89.6`, center: true },
  // ── trapezius fiber arc (front slope) ──
  { d: `M 63.6,76.4 C 69.6,78.4 76.6,81.6 83.4,85.6`, seam: true },
  // clavicle — S-curve sternum → acromion
  { d: `M 61.9,93.2 C 68,89.9 76,89 83.6,89.4 C 88,90.6 92.2,91.4 95.8,90.2` },
  // sternum line (center)
  { d: `M 60,95.6 C 59.9,104 59.9,112.6 60,120.4`, center: true },
  // sternocleidomastoid — neck reads as anatomy (seam)
  { d: `M 62.7,60.4 C 63.9,64.8 64.7,69.4 65,74.4 C 65.2,77.4 64.6,80.2 63.8,83.6`, seam: true },
  // deltopectoral groove ink
  { d: `M 90.6,109.8 C 92.2,103 93.6,95.8 95,89.2` },
  // clavicular head of the pec (upper/lower pec split, seam)
  { d: `M 62.6,96.6 C 68.2,95.2 74.6,94.8 80.4,95.8 C 84.4,96.6 87.6,98.4 89.8,100.6`, seam: true },
  // pec striation fans — fiber texture fanning toward the humerus (v7)
  { d: `M 65.6,104.6 C 71,101.6 76.6,100 82.2,100.8` },
  { d: `M 66.4,111.4 C 71.4,108.8 76.4,107.8 81,108.6` },
  // navel (center)
  { d: `M 58.9,157.6 C 59.9,157 60.8,157 61.1,157.6 C 60.8,158.4 59.9,158.4 58.9,157.6 Z`, center: true },
  // tendinous cuts — the six-pack read (seams: body-toned, strong)
  { d: `M 62,140.4 C 66.2,141.8 70.2,141.4 73.8,139.4`, seam: true },
  { d: `M 61.9,153.6 C 66.2,155 70.4,154.6 74.2,152.2`, seam: true },
  { d: `M 61.9,166.4 C 65.8,167.6 69.6,167.2 73.2,165`, seam: true },
  // linea alba below the navel — the line the six-pack hangs on (center, v7)
  { d: `M 60,158.8 C 60.2,168 60.2,178 60.4,189.6`, center: true },
  // oblique finger hints — interdigitated with the serratus zone (seams, v7)
  { d: `M 79.2,130.8 C 80.4,135.2 80.8,139.8 80.4,144.4`, seam: true },
  { d: `M 81.6,137 C 82.2,141.4 82.4,146.2 82,151`, seam: true },
  // inguinal / hip-flexor line (the V at the pelvis)
  { d: `M 61.8,208.6 C 65.4,211 69.4,213.8 73,217` },
  // tensor-fasciae-latae / abductor hint on the hip (v7)
  { d: `M 85.2,206.8 C 85.9,215.6 86.1,224.8 85.4,233.8` },
  // rectus femoris column — medial + lateral grooves (seams)
  { d: `M 67.2,219 C 66.8,236 66.4,254 66.2,272 C 66.1,281.6 66.2,289.4 66.6,295`, seam: true },
  { d: `M 73.8,219.6 C 74.8,234 74.6,252 73.2,270 C 72.4,280.6 71.2,289.6 69.8,296.6`, seam: true },
  // vastus lateralis sweep (seam)
  { d: `M 78.6,230 C 77.6,246 75.8,262 72.6,277 C 71,284.8 69.2,291.4 67.4,296.6`, seam: true },
  // vastus medialis teardrop hint (inner sweep above the knee)
  { d: `M 64.4,278 C 65.2,284.6 65.4,291 64.9,296.4` },
  // patella (knee cap)
  { d: `M 66.4,299.4 C 68.4,297.6 70.8,297.4 72.6,298.6 C 73.8,299.6 73.6,301.2 72.2,302.2 C 70.2,303.6 67.4,303.6 65.8,302.4 C 64.8,301.4 65.1,300.2 66.4,299.4 Z` },
  // patellar tendon — the small hard line below the cap (v7)
  { d: `M 66.6,302.8 C 66.5,305.2 66.5,307.4 66.7,309.6` },
  // serratus anterior finger hints — the "boxer's ribs" detail (seam shadows)
  { d: `M 83,120.8 C 82.2,124.4 81.2,128 79.8,131.4`, seam: true },
  { d: `M 84.6,127.6 C 83.8,131.2 82.6,134.8 81,138.2`, seam: true },
  { d: `M 86.2,134.4 C 85.4,138.2 84.2,142 82.6,145.6`, seam: true },
  // tibialis / shin line
  { d: `M 64.2,315 C 64.9,330 65,346 64.2,360 C 63.8,366.8 63.2,372.6 62.6,377.6` },
  // fibula line — outer shin reads as two bones (v7)
  { d: `M 72.4,318 C 72.8,332 72.6,346 71.6,358 C 71.2,364.4 70.6,370.4 69.9,376.4` },
  // elbow + wrist creases (limbs read as joints, not tubes)
  { d: `M 88.4,157.6 C 90.2,158.6 92,158.8 93.8,158` },
  { d: `M 86.4,201.4 C 88.2,202.4 90,202.6 91.8,201.8` },
  // forearm split — brachioradialis (lateral) vs flexor group (medial), seam
  { d: `M 91.4,163.4 C 92.6,169 92.8,175.4 92,182.4 C 91.4,187.6 90.6,192 89.8,195.6`, seam: true },
  // thumb hint
  { d: `M 88.2,204.4 C 87.6,207.6 87.4,210.8 87.8,214` },
  // hand — knuckle row + finger separators: the tip reads as a hand (v7)
  { d: `M 84.6,211.8 C 85.8,211.4 87,211.4 88,212` },
  { d: `M 85.4,213.8 C 85.2,215.6 85.2,217.4 85.5,219` },
  { d: `M 87.4,213.8 C 87.2,215.6 87.2,217.4 87.5,219` },
  // foot — toe separators + arch: the sole reads as a foot (v7)
  { d: `M 59,401.6 C 60.2,401 61.4,401 62.4,401.6` },
  { d: `M 60.7,398.6 C 60.4,400 60.4,401.8 60.7,403.2` },
  // biceps long/short head split (seam)
  { d: `M 92.6,123.6 C 91.6,131.4 91.2,139.4 92,147.8`, seam: true },
  // ankle hint
  { d: `M 66.2,379.4 C 65.4,382 64.6,384.8 63.9,387.6` },
];

const BACK_DETAIL_SET: readonly DetailPath[] = [
  // ── head (v7): hair cap + ear — the back-of-skull reads as a head ──
  { d: `M 60.4,31.6 C 66,29.8 71.6,30.2 76,33.6` },
  { d: `M 75.2,35.4 C 76.9,37 77.2,40.4 76,43` },
  // spine — full furrow (center)
  { d: `M 60,72 C 59.9,96 60,122 60.2,148 C 60.3,166 60.3,184 60.2,200`, center: true },
  // sacral center + triangle (center)
  { d: `M 60,197 C 59.9,200.2 59.9,203.6 60,206.4`, center: true },
  { d: `M 62.4,196.8 C 63,199.4 62.6,202 61.9,204.4 C 61.2,205.6 60.5,206.2 59.7,206.2` },
  // upper-trap fibers — arcs sweeping from the skull base onto the slope (v7)
  { d: `M 62.8,52.2 C 68.4,54.6 74.6,58.2 80,62.6`, seam: true },
  { d: `M 62.4,56.8 C 67.6,59 73,62 77.8,65.8`, seam: true },
  // scapula medial border (rake from the trap diamond toward the armpit)
  { d: `M 79.4,104 C 80.2,108.4 80,113 78.6,117.4` },
  // teres / infraspinatus sweep under the trap
  { d: `M 74,110.4 C 78.4,113.2 82,117 84.2,121.6` },
  // infraspinatus texture — extra fiber rake beside the scapula border (v7)
  { d: `M 72,104.8 C 75.8,107.4 78.8,111 80.8,115.2` },
  // trapezius lower-fiber rake (inside the diamond, seam)
  { d: `M 61.4,122 C 66.8,119 72.4,114.8 77.4,110`, seam: true },
  // triceps lateral/long-head split (seam, the inner mass line)
  { d: `M 92.8,125 C 93.4,132 93,139 91.8,145.4`, seam: true },
  // lat sweep hint (under the wing's outer edge)
  { d: `M 87.6,116 C 86.4,124 84.6,132.4 82.2,140.4` },
  // lower-lat sweep — the wing converging into the lumbar V (v7)
  { d: `M 84.6,138 C 81.8,146.4 78.2,154.6 73.8,161.8` },
  // iliac crest / hip dimple lines
  { d: `M 66.4,185.4 C 69.4,187.6 72,190.6 73.8,194.2` },
  // gluteal fold crease (seam, cuts across the glute's lower third — double
  // line so it reads clearly at small sizes)
  { d: `M 62.4,220.6 C 66.6,223.6 71.2,224.2 75.4,221.6`, seam: true },
  { d: `M 63,223.8 C 66.8,226.4 70.8,226.8 74.4,224.6`, seam: true },
  // hamstring split (biceps femoris / semitendinosus, seam, centered on the belly)
  { d: `M 66.8,235.4 C 67.8,247 68.2,258 67.4,270 C 66.9,276.4 66.2,282.4 65.4,288`, seam: true },
  // biceps-femoris short-head split — the outer hamstring mass (v7)
  { d: `M 73.4,242 C 72.6,253 71.2,263.6 69.2,273.6`, seam: true },
  // knee back crease
  { d: `M 63.4,299.6 C 65.6,302 68.2,303.2 70.8,302.8` },
  // calf head split + Achilles line (seam split, centered on the diamond)
  { d: `M 68.8,309 C 67.8,318.6 67.2,330.4 66.4,342 C 66.1,346.4 65.8,350.4 65.5,353.4`, seam: true },
  { d: `M 70.4,334.4 C 69.2,341.4 67.8,348.4 66.6,354.4` },
  // soleus sweep under the calf diamond — the flat muscle under the heads (v7)
  { d: `M 64.2,344 C 67,347.6 69,352 69.8,357.2` },
  // elbow + wrist creases (back of the arm)
  { d: `M 88.6,156.8 C 90.4,157.6 92.2,157.8 94,157` },
  { d: `M 86.4,201.2 C 88.2,202 90,202.2 91.8,201.4` },
  // hand — knuckle row on the back of the hand (v7)
  { d: `M 84.8,211.8 C 85.9,211.4 87,211.4 88,212` },
  // nape line (skull base)
  { d: `M 62.4,44 C 66,49.6 70.6,53.8 75.6,56.8` },
  // ankle hint
  { d: `M 66.2,379.4 C 65.4,382 64.6,384.8 63.9,387.6` },
  // foot — toe separators on the back sole (v7)
  { d: `M 59.2,401.6 C 60.3,401 61.4,401 62.4,401.6` },
  { d: `M 60.8,398.6 C 60.5,400 60.5,401.8 60.8,403.2` },
];

function buildDetails(set: readonly DetailPath[], shift: number): BuiltDetail[] {
  const out: BuiltDetail[] = [];
  for (const { d, center, seam } of set) {
    const s = shift ? shiftD(d, shift) : d;
    if (center) {
      out.push({ d: s, seam: !!seam }); // mirror === itself (authored on x = 60)
    } else {
      const m = shift ? mirrorD(s, BACK_AXIS) : mirrorD(s, FRONT_AXIS);
      out.push({ d: s, seam: !!seam }, { d: m, seam: !!seam });
    }
  }
  return out;
}

export const FRONT_DETAILS: readonly BuiltDetail[] = buildDetails(FRONT_DETAIL_SET, 0);
export const BACK_DETAILS: readonly BuiltDetail[] = buildDetails(BACK_DETAIL_SET, BACK_SHIFT);

/* ── badge anchors (right-half centers, dx relative to axis) ──── */

export const BADGE_ANCHORS: Record<string, { dx: number; y: number }> = {
  chest: { dx: 12, y: 106 },
  front_delts: { dx: 31.5, y: 100 },
  side_delts: { dx: 35.5, y: 98 },
  biceps: { dx: 33.5, y: 134 },
  forearms: { dx: 31, y: 177 },
  abs: { dx: 8.5, y: 150 },
  quads: { dx: 11, y: 244 },
  upper_back: { dx: 13, y: 96 },
  lats: { dx: 12.5, y: 145 },
  rear_delts: { dx: 34.5, y: 99 },
  triceps: { dx: 34, y: 135 },
  lower_back: { dx: 4.5, y: 168 },
  glutes: { dx: 11, y: 210 },
  hamstrings: { dx: 8.5, y: 261 },
  calves: { dx: 6.5, y: 322 },
};

/**
 * v7: view-specific badge anchors. The back diamond and the front slope are
 * different shapes — a badge centered for one lands off-center on the other.
 * Keys here override BADGE_ANCHORS for the given view only.
 */
export const FRONT_BADGE_OVERRIDES: Record<string, { dx: number; y: number }> = {
  upper_back: { dx: 17.5, y: 80.5 },
};
