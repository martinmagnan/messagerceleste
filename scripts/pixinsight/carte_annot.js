// carte_annot.js — images annotées (moteur du script AnnotateImage, sans sa boîte de dialogue).
// Entrées : WORK/<id>.xisf (images résolues par carte_solve.js) — Sorties : ROOT/out/<slug>__<variante>.jpg, ROOT/annot_final.log
// N'enregistre aucun réglage : les préférences AnnotateImage de l'utilisateur ne sont pas modifiées.
#engine v8

#define USE_ANNOTATE_LIBRARY true
#define SETTINGS_MODULE "ClaudeCarteAnnot"
#include "/Applications/PixInsight/src/scripts/AnnotateImage/AnnotateImage.js"

var ROOT = "/Volumes/Cassini/PixInsight_claude/carte_tmp";
var WORK = "/Volumes/AstroWire/PixInsight_Processing/_site_cartes";
var SLUGS = ["coeur-et-ame", "ic4604-rho-ophiuchi", "m16-aigle", "m20-m8-trifide-lagune", "m31-andromede", "m33-triangle", "m45-pleiades", "m78", "m81-m82", "ngc1333", "ngc1909-tete-de-sorciere", "ngc6888-croissant", "ngc7023-iris", "sh2-132-lion", "sh2-184-pacman", "wr134"];
var RUN = ["H"];

var __lines = [];
function log(s) { s = String(s); __lines.push(s); try { console.writeln(s); } catch (e) {} try { File.writeTextFile(ROOT + "/annot_final.log", __lines.join("\n") + "\n"); } catch (e) {} }
function idOf(slug) { return "c_" + slug.replace(/[^A-Za-z0-9]/g, "_"); }

function common(engine) {
   engine.outputMode = AnnotationEngine.OutputMode.Image;
   engine.applySTF = false;            // l'image est déjà étirée
   engine.grayscaleImage = false; engine.invertImage = false; engine.imageOverlay = false;
   engine.removeDuplicates = true; engine.optimizeLabelPlacement = true;
   engine.leaderLines = true; engine.leaderLineColor = 0xb0ffffff; engine.leaderLineWidth = 1;
   engine.labelReductionFactor = 0.7;
   engine.writeObjects = false; engine.exportPath = ""; engine.exportOnly = false; engine.scalingFactor = 1.0;
   engine.dropShadow = false; engine.textScale = 2.0; engine.graphicsScale = 1.0;
}
function cat(engine, name, color, size, o) {
   o = o || {};
   let l = LayerRegistry.newLayer(name);
   if (!l) { log("   couche inconnue: " + name); return null; }
   l.visible = true;
   l.gprops.lineColor = o.lineColor !== undefined ? o.lineColor : color;
   l.gprops.labelColor = color;
   l.gprops.labelSize = size;
   l.gprops.lineWidth = o.lineWidth !== undefined ? o.lineWidth : 1;
   if (o.bold) l.gprops.labelBold = true;
   if (o.italic) l.gprops.labelItalic = true;
   if (o.face) l.gprops.labelFace = o.face;
   if (o.showMarkers === false) l.gprops.showMarkers = false;
   if (o.labels) l.gprops.labelFields = o.labels;
   if (o.density) l.density = o.density;
   if (o.magMax !== undefined && l.catalog) l.catalog.magMax = o.magMax;
   if (o.labelMagnitudeMax !== undefined) l.labelMagnitudeMax = o.labelMagnitudeMax;
   engine.layers.push(l);
   return l;
}

var VARIANTS = {
   // Réglages retenus après deux séries d'essais (2026-11-26) :
   //  - grille équatoriale très discrète, libellés lisibles ;
   //  - Messier en tête (sinon supplanté par son numéro NGC), en doré et en gras ;
   //  - NGC/IC en bleu clair, cercles et contours atténués ;
   //  - Sharpless en rose avec contours très légers, Barnard en gris clair, vdB en bleu lavande ;
   //  - étoiles nommées jusqu'à la magnitude 5,5 ;
   //  - ombre portée sous les textes, pas de voile sur l'image, échelle de texte 2.
   H: function (engine) {
      engine.layers = [];
      engine.dropShadow = true; engine.shadowOffset = 2;
      engine.textScale = 2.0; engine.graphicsScale = 1.0;
      cat(engine, "Grid", 0x99ffffff, 11, { lineColor: 0x26ffffff, density: 4 });
      cat(engine, "Messier", 0xffffe08a, 18, { bold: true, lineColor: 0xb0ffe08a });
      cat(engine, "NGC-IC", 0xffa8dcff, 14, { lineColor: 0x80a8dcff });
      cat(engine, "Sharpless", 0xffffa8a8, 14, { lineColor: 0x60ffa8a8 });
      cat(engine, "Barnard", 0xffdcdcdc, 12, { lineColor: 0xa0dcdcdc });
      cat(engine, "VdB", 0xffb4c6ff, 12, { lineColor: 0xa0b4c6ff });
      cat(engine, "NamedStars", 0xffffffff, 12, { magMax: 5.5 });
   }
};

function saveJpeg(win, path, quality) {
   if (File.exists(path)) File.remove(path);
   let F = new FileFormat("JPEG", false, true), f = new FileFormatInstance(F);
   if (!f.create(path, "quality " + quality)) throw new Error("JPEG create: " + path);
   let d = new ImageDescription; d.bitsPerSample = 8; d.ieeefpSampleFormat = false;
   if (!f.setOptions(d)) throw new Error("JPEG setOptions");
   if (!f.writeImage(win.mainView.image)) throw new Error("JPEG writeImage");
   f.close();
}

try {
   let nOk = 0, nKo = 0;
   for (let slug of SLUGS) {
      let id = idOf(slug), src = null;
      log(">> " + slug);
      try {
         let ws = ImageWindow.open(WORK + "/" + id + ".xisf");
         if (!ws || ws.length < 1) throw new Error("image résolue introuvable");
         src = ws[0];
         if (!src.hasAstrometricSolution) throw new Error("pas de solution astrométrique");
         for (let v of RUN) {
            let t0 = Date.now(), out = null;
            try {
               let engine = new AnnotationEngine;
               engine.Init(src);
               engine.SetDefaults();
               common(engine);
               VARIANTS[v](engine);
               out = engine.Render();
               try { engine.ReportLayerErrors(false); } catch (e) { log("   couches: " + e); }
               if (engine.layerErrors && engine.layerErrors.length) log("   erreurs de couches: " + engine.layerErrors.map(e => String(e.message || e)).join(" ; ").substring(0, 400));
               if (!out) throw new Error("aucune image produite");
               let path = ROOT + "/out/" + slug + "__" + v + ".jpg";
               saveJpeg(out, path, 90);
               ++nOk;
               log("   " + v + " OK (" + ((Date.now() - t0) / 1000).toFixed(1) + " s) " + out.mainView.image.width + "x" + out.mainView.image.height);
            } catch (e) { ++nKo; log("   !! " + v + " ERREUR: " + e); }
            try { if (out) out.forceClose(); } catch (e) {}
         }
      } catch (e) { ++nKo; log("!! " + slug + " ERREUR: " + e); }
      try { if (src) src.forceClose(); } catch (e) {}
   }
   log(nKo == 0 ? "FIN OK (" + nOk + ")" : "FIN ERREUR (" + nOk + " ok, " + nKo + " en échec)");
} catch (e) { log("FIN ERREUR " + e); }
