// carte_solve.js — pour chaque image de la galerie du site : résolution astrométrique de la version 2200 px,
// enregistrement de l'image résolue sur AstroWire, puis carte de repérage (processus FindingChart).
// Entrées : ROOT/in/<slug>.jpg — Sorties : ROOT/out/ (cartes), WORK/<id>.xisf (images résolues), ROOT/solve_tout.log
#include <pjsr/UndoFlag.jsh>
#include <pjsr/SampleType.jsh>
#define __PJSR_USE_STAR_DETECTOR_V2
#include <pjsr/BRQuadTree.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/DataType.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/LinearTransformation.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/RBFType.jsh>
#include <pjsr/SectionBar.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/StarDetector.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/TextAlign.jsh>
#define USE_SOLVER_LIBRARY true
#define SETTINGS_MODULE "SOLVER"
#define STAR_CSV_FILE (File.systemTempDirectory + "/claude_stars.csv")
#include "/Applications/PixInsight/src/scripts/AdP/WCSmetadata.jsh"
#include "/Applications/PixInsight/src/scripts/AdP/AstronomicalCatalogs.jsh"
#include "/Applications/PixInsight/src/scripts/AdP/ImageSolver.js"

var ROOT = "/Volumes/Cassini/PixInsight_claude/carte_tmp";
var WORK = "/Volumes/AstroWire/PixInsight_Processing/_site_cartes";
// ONLY : liste de slugs à traiter (vide = tous). REDO : refaire même si l'image résolue existe déjà.
var ONLY = [];
var REDO = false;
var CHART = { chartSize: 1600 };
var CIBLES = [
   { slug: "coeur-et-ame", ra: 40.5, dec: 61.5, res: 0.0026818 },
   { slug: "ic4604-rho-ophiuchi", ra: 247.25, dec: -23.933, res: 0.0014545 },
   { slug: "m16-aigle", ra: 274.75, dec: -13.817, res: 0.0014545 },
   { slug: "m20-m8-trifide-lagune", ra: 271.5, dec: -23.75, res: 0.0014091 },
   { slug: "m45-pleiades", ra: 58.2, dec: 24.6, res: 0.0027727 },
   { slug: "m78", ra: 87.5, dec: 0.367, res: 0.0015000 },
   { slug: "m81-m82", ra: 146.75, dec: 69.4, res: 0.0015000 },
   { slug: "ngc1333", ra: 52.25, dec: 30.717, res: 0.0015000 },
   { slug: "ngc1909-tete-de-sorciere", ra: 75.75, dec: -8.3, res: 0.0014545 },
   { slug: "ngc6888-croissant", ra: 303.75, dec: 39.4, res: 0.0027273 },
   { slug: "ngc7023-iris", ra: 313, dec: 67.933, res: 0.0015000 },
   { slug: "sh2-132-lion", ra: 335.25, dec: 55.8, res: 0.0015000 },
   { slug: "sh2-184-pacman", ra: 13.25, dec: 56.617, res: 0.0015000 },
   { slug: "wr134", ra: 302.5, dec: 36.167, res: 0.0015000 }
];

var __lines = [];
function log(s) { s = String(s); __lines.push(s); try { console.writeln(s); } catch (e) {} try { File.writeTextFile(ROOT + "/solve_tout.log", __lines.join("\n") + "\n"); } catch (e) {} }
function ensureDir(d) { if (!File.directoryExists(d)) File.createDirectory(d, true); }
function idOf(slug) { return "c_" + slug.replace(/[^A-Za-z0-9]/g, "_"); }

function solve(w, t) {
   var solver = new ImageSolver;
   solver.Init(w, false);
   solver.metadata.ra = t.ra; solver.metadata.dec = t.dec;
   solver.metadata.useFocal = false; solver.metadata.resolution = t.res;
   // Le JPEG n'a pas de date d'observation, exigée par le catalogue Gaia local : une date proche suffit.
   solver.metadata.observationTime = new Date("2026-06-01T00:00:00Z");
   solver.solverCfg.showStars = false; solver.solverCfg.showDistortion = false; solver.solverCfg.generateErrorImg = false;
   var ok = solver.SolveImage(w);
   return ok && w.hasAstrometricSolution;
}

function findingChart(w, outDir) {
   var P = new FindingChart;
   P.chartSize = CHART.chartSize;
   P.autoChartResolution = true;
   P.autoChartMaxMagnitude = true;
   P.drawNGCObjects = false;
   P.generateBitmapFile = true;
   P.outputDirectory = outDir;
   P.outputSuffix = "_fc";
   P.closeOutputWindow = true;
   return P.executeOn(w.mainView);
}

try {
   ensureDir(WORK); ensureDir(ROOT + "/out");
   var nOk = 0, nKo = 0;
   for (var i = 0; i < CIBLES.length; ++i) {
      var t = CIBLES[i];
      if (ONLY.length && ONLY.indexOf(t.slug) < 0) continue;
      var id = idOf(t.slug), xisf = WORK + "/" + id + ".xisf", t0 = (new Date).getTime(), w = null;
      log(">> " + t.slug);
      try {
         if (!REDO && File.exists(xisf)) {
            w = ImageWindow.open(xisf)[0];
            log("   image résolue déjà présente (astrométrie=" + w.hasAstrometricSolution + ")");
         } else {
            var ws = ImageWindow.open(ROOT + "/in/" + t.slug + ".jpg");
            if (!ws || ws.length < 1) throw new Error("ouverture impossible");
            w = ws[0]; w.mainView.id = id;
            if (!solve(w, t)) throw new Error("résolution astrométrique échouée");
            if (File.exists(xisf)) File.remove(xisf);
            if (!w.saveAs(xisf, false, false, false, false)) throw new Error("sauvegarde impossible: " + xisf);
            log("   résolue et enregistrée: " + xisf);
         }
         try { log("   " + String(w.astrometricSolutionSummary()).replace(/\s*\n\s*/g, " | ").substring(0, 600)); } catch (e) {}
         var okc = findingChart(w, ROOT + "/out");
         log("   FindingChart: " + okc);
         ++nOk;
         log("<< " + t.slug + " OK (" + (((new Date).getTime() - t0) / 1000).toFixed(1) + " s)");
      } catch (e) {
         ++nKo;
         log("!! " + t.slug + " ERREUR: " + e);
      }
      try { if (w) w.forceClose(); } catch (e) {}
   }
   var ff = new FileFind, names = [];
   if (ff.begin(ROOT + "/out/*")) do { if (ff.name.charAt(0) != ".") names.push(ff.name + " (" + ff.size + ")"); } while (ff.next());
   log("sorties: " + names.join(", "));
   log(nKo == 0 ? "FIN OK (" + nOk + ")" : "FIN ERREUR (" + nOk + " ok, " + nKo + " en échec)");
} catch (e) { log("FIN ERREUR " + e); }
