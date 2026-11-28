// champs_galerie.js — contour céleste exact de chaque image résolue de la galerie (images 2200 px résolues
// par carte_solve.js). Sortie : /Volumes/Cassini/PixInsight_claude/champs_galerie.json
#include "/Applications/PixInsight/src/scripts/AdP/WCSmetadata.jsh"

var WORK = "/Volumes/AstroWire/PixInsight_Processing/_site_cartes";
var SORTIE = "/Volumes/Cassini/PixInsight_claude/champs_galerie.json";
var PAS = 8; // points par côté

var res = {}, journal = [];
function log(s) { journal.push(String(s)); console.writeln(s); }

function versCiel(w, md, x, y) {
   var p = null;
   try { p = w.imageToCelestial(new Point(x, y)); } catch (e) { p = null; }
   if (!p) p = md.Convert_I_to_RD(new Point(x, y));
   return [Math.round(p.x * 10000) / 10000, Math.round(p.y * 10000) / 10000];
}

var fichiers = [];
var ff = new FileFind;
if (ff.begin(WORK + "/c_*.xisf")) do { if (!ff.isDirectory) fichiers.push(ff.name); } while (ff.next());
ff.end();
log("fichiers: " + fichiers.join(", "));

for (var i = 0; i < fichiers.length; ++i) {
   var w = null;
   try {
      w = ImageWindow.open(WORK + "/" + fichiers[i])[0];
      var md = new ImageMetadata();
      md.ExtractMetadata(w);
      var W = w.mainView.image.width, H = w.mainView.image.height;
      var contour = [], k;
      for (k = 0; k < PAS; ++k) contour.push(versCiel(w, md, W * k / PAS, 0));
      for (k = 0; k < PAS; ++k) contour.push(versCiel(w, md, W, H * k / PAS));
      for (k = 0; k < PAS; ++k) contour.push(versCiel(w, md, W - W * k / PAS, H));
      for (k = 0; k < PAS; ++k) contour.push(versCiel(w, md, 0, H - H * k / PAS));
      var coins = [versCiel(w, md, 0, 0), versCiel(w, md, W, 0), versCiel(w, md, W, H), versCiel(w, md, 0, H)];
      var cle = fichiers[i].replace(/^c_/, "").replace(/\.xisf$/, "");
      res[cle] = { largeur: W, hauteur: H, centre: versCiel(w, md, W / 2, H / 2), coins: coins, contour: contour, resolution: md.resolution };
      log("OK " + cle + " " + W + "x" + H + " centre " + res[cle].centre);
   } catch (e) {
      log("ERREUR " + fichiers[i] + " : " + e);
   }
   if (w) w.forceClose();
}
File.writeTextFile(SORTIE, JSON.stringify({ champs: res, journal: journal }, null, 1));
log("FIN");
