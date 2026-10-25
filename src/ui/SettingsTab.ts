import { App, PluginSettingTab, Setting } from "obsidian";
import type BookMindPlugin from "../main";
import { dir, getLang, t } from "../i18n";

export class BookMindSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: BookMindPlugin) { super(app, plugin); }

  redraw(): void { if (this.containerEl.isShown()) this.display(); }

  display(): void {
    const P = this.plugin, S = P.data.settings, el = this.containerEl;
    el.empty();
    el.addClass("bm-settings");
    el.setAttr("dir", dir());
    const save = async (refresh = true) => { await P.save(); if (refresh) P.refresh(); };
    el.createEl("h2", { text: t("appTitle") });

    new Setting(el).setName(t("sLanguage")).addButton(b => b
      .setButtonText(getLang() === "en" ? "EN ✓ | عربي" : "EN | عربي ✓")
      .onClick(async () => { await P.toggleLang(); this.display(); }));

    const rj = P.rj.get();
    new Setting(el).setName(t("sIntegration")).setDesc(t("sIntegrationDesc") + " — " + (rj ? t("sDetected") : t("sMissing")))
      .addToggle(c => c.setValue(S.useReadingJourney).onChange(async v => { S.useReadingJourney = v; if (!v) P.rj.detach(); await save(); P.library.scheduleIndex(50); this.display(); }));
    if (!rj) {
      new Setting(el).setName(t("sBooksFolder")).setDesc(t("sBooksFolderDesc", { folder: P.rj.folder(S.booksFolder) }))
        .addText(c => c.setPlaceholder("Books").setValue(S.booksFolder).onChange(async v => { S.booksFolder = v.trim(); await save(false); P.library.scheduleIndex(); }));
      new Setting(el).setName(t("sYearGoal")).setDesc(t("sYearGoalDesc"))
        .addText(c => { c.inputEl.type = "number"; c.setValue(String(S.yearGoal)).onChange(async v => { S.yearGoal = Math.max(0, Number(v) || 0); await save(); }); });
    }

    new Setting(el).setName(t("sDaily")).addSlider(s => s.setLimits(1, 10, 1).setValue(S.dailyHighlights).setDynamicTooltip().onChange(async v => { S.dailyHighlights = v; await save(); }));
    new Setting(el).setName(t("sStalled")).addSlider(s => s.setLimits(3, 60, 1).setValue(S.stalledDays).setDynamicTooltip().onChange(async v => { S.stalledDays = v; await save(); }));

    new Setting(el).setName(t("sGoogle")).setDesc(t("sGoogleDesc"))
      .addText(c => { c.inputEl.type = "password"; c.setValue(S.googleApiKey).onChange(async v => { S.googleApiKey = v.trim(); await save(false); }); });
    new Setting(el).setName(t("sDownloadCovers")).setDesc(t("sDownloadCoversDesc"))
      .addToggle(c => c.setValue(S.downloadCovers).onChange(async v => { S.downloadCovers = v; await save(false); this.display(); }));
    if (S.downloadCovers) new Setting(el).setName(t("sCoversFolder")).addText(c => c.setValue(S.coversFolder).onChange(async v => { S.coversFolder = v.trim(); await save(false); }));

    const folder = (name: string, key: "reportsFolder" | "cardsFolder" | "flashcardsFolder" | "conceptsFolder", desc = "") =>
      new Setting(el).setName(name).setDesc(desc).addText(c => c.setValue(S[key]).onChange(async v => { S[key] = v.trim(); await save(false); }));
    folder(t("sReports"), "reportsFolder");
    folder(t("sCards"), "cardsFolder");
    folder(t("sFlash"), "flashcardsFolder");
    folder(t("sConcepts"), "conceptsFolder", t("sConceptsDesc"));

    new Setting(el).setName(t("sStatusBar")).addToggle(c => c.setValue(S.showStatusBar).onChange(async v => { S.showStatusBar = v; await save(); }));
  }
}
