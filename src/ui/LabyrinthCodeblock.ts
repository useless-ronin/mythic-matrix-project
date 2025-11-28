// src/ui/LabyrinthCodeblock.ts

import { MarkdownPostProcessorContext, MarkdownRenderChild, TFile, Notice } from "obsidian";
import MythicMatrixPlugin from "../main";

export class LabyrinthControlsRenderer extends MarkdownRenderChild {
    plugin: MythicMatrixPlugin;
    sourcePath: string;
    
    constructor(containerEl: HTMLElement, plugin: MythicMatrixPlugin, sourcePath: string) {
        super(containerEl);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
    }

    onload() {
        this.render();
    }

    async render() {
        const container = this.containerEl;
        container.empty();
        container.addClass("labyrinth-controls-block");

        // Get file and metadata
        const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
        if (!(file instanceof TFile)) return;

        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        
        // --- Header ---
        container.createEl("h4", { text: "🔮 Labyrinth Actions", cls: "labyrinth-controls-header" });
        const btnGroup = container.createDiv({ cls: "labyrinth-btn-group" });

        // --- BUTTON 1: Guardian Task (L19) ---
        const guardianBtn = btnGroup.createEl("button", { text: "🛡️ Create Guardian Task", cls: "lab-btn" });
        guardianBtn.onclick = async () => {
            await this.plugin.lossLogService.createGuardianTaskFromActiveNote(file);
            guardianBtn.setText("✅ Guardian Created");
            guardianBtn.disabled = true;
        };

        // --- BUTTON 2: Enshrine Thread (L97) ---
        if (fm?.ariadnesThread && !fm.enshrined) {
            const enshrineBtn = btnGroup.createEl("button", { text: "📜 Enshrine Thread", cls: "lab-btn" });
            enshrineBtn.onclick = async () => {
                await this.plugin.lossLogService.enshrineThread(file);
                enshrineBtn.setText("✨ Enshrined");
                enshrineBtn.disabled = true;
            };
        }

        // --- BUTTON 3: Resolve Scrying Risk (L15) ---
        // Only show if it's a "Future Risk" (Scrying Pool)
        if (fm?.provenance?.origin === "scrying-pool" && !fm.resolved) {
            const resolveDiv = container.createDiv({ cls: "scrying-resolve-container" });
            resolveDiv.createEl("strong", { text: "Did this risk manifest?" });
            
            const group = resolveDiv.createDiv({ cls: "labyrinth-btn-group" });
            
            const yesBtn = group.createEl("button", { text: "Yes (Failed)", cls: "lab-btn-danger" });
            yesBtn.onclick = async () => {
                await this.resolveRisk(file, true);
                resolveDiv.remove();
                new Notice("Risk confirmed as failure.");
            };

            const noBtn = group.createEl("button", { text: "No (Avoided)", cls: "lab-btn-success" });
            noBtn.onclick = async () => {
                await this.resolveRisk(file, false);
                resolveDiv.remove();
                new Notice("Risk avoided! +20 XP");
            };
        }
    }

    async resolveRisk(file: TFile, manifested: boolean) {
        await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
            fm.resolved = true;
            fm.outcome = manifested ? "Manifested" : "Avoided";
            // Remove the future-risk tag if avoided
            if (!manifested) {
                fm.tags = (fm.tags || []).filter((t: string) => t !== "loss/future-risk");
                fm.tags.push("loss/avoided");
            }
        });

        if (!manifested) {
            // Reward XP for dodging the bullet
            this.plugin.settings.labyrinthXP += 20;
            await this.plugin.saveSettings();
        }
    }
}