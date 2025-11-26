// src/settings/MythicMatrixSettingTab.ts

import { App, PluginSettingTab, Setting } from 'obsidian';
import MythicMatrixPlugin from '../main';
import { QUADRANT_IDS } from '../constants';

export class MythicMatrixSettingTab extends PluginSettingTab {
    plugin: MythicMatrixPlugin;

    constructor(app: App, plugin: MythicMatrixPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Mythic Matrix Settings' });

        

        // --- Alchemist Log Settings ---
        new Setting(containerEl)
            .setName('Alchemist Log Folder')
            .setDesc('Folder where reflection logs will be saved.')
            .addText(text => text
                .setPlaceholder('Example: 40 Reflections/Alchemist')
                .setValue(this.plugin.settings.alchemistLogFolder)
                .onChange(async (value) => {
                    this.plugin.settings.alchemistLogFolder = value.trim() || "40 Reflections/Alchemist";
                    await this.plugin.saveSettings();
                }));

        // src/settings/MythicMatrixSettingTab.ts
new Setting(containerEl)
    .setName("Synthesis Note Folder")
    .setDesc("Folder where Weaver's Loom notes will be saved.")
    .addText(text => text
        .setPlaceholder("Example: 50 Synthesis")
        .setValue(this.plugin.settings.synthesisNoteFolder)
        .onChange(async (value) => {
            this.plugin.settings.synthesisNoteFolder = value.trim() || "50 Synthesis";
            await this.plugin.saveSettings();
        }));        


        // --- Phoenix Nest (Spaced Repetition) Settings ---
        containerEl.createEl('h3', { text: 'Phoenix Nest (Spaced Repetition)' });
        
        new Setting(containerEl)
            .setName('Enable Spaced Repetition')
            .setDesc('When a task with a linked note is completed, schedule it for review.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableRevision)
                .onChange(async (value) => {
                    this.plugin.settings.enableRevision = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('Phoenix Intervals')
            .setDesc('Spaced repetition intervals in days, separated by commas.')
            .addText(text => text
                .setPlaceholder('e.g., 1, 3, 7, 14, 21, 30')
                .setValue(this.plugin.settings.phoenixIntervals.join(', '))
                .onChange(async (value) => {
                    // Parse the string into an array of numbers
                    const intervals = value.split(',')
                                         .map(s => parseInt(s.trim(), 10))
                                         .filter(n => !isNaN(n) && n > 0);
                    this.plugin.settings.phoenixIntervals = intervals;
                    await this.plugin.saveSettings();
                }));

                // --- Weaver's Loom Rituals ---
        containerEl.createEl('h3', { text: 'Weavers Loom' });

        new Setting(containerEl)
                .setName("Enable Weaver's Loom Rituals")
                .setDesc("Full-screen focus mode for deep synthesis")
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.enableLoomRituals)
                    .onChange(async (value) => {
                    this.plugin.settings.enableLoomRituals = value;
                    await this.plugin.saveSettings();
                    })); 


             // --- NEW: Labyrinth Settings Section ---
        new Setting(containerEl)
            .setName("Labyrinth of Loss Settings")
            .setHeading();

        // Add setting for Loom Deferral Threshold (L85)
        new Setting(containerEl)
            .setName("Loom Deferral Threshold (L85)")
            .setDesc("Number of times a Weaver's Loom task must be deferred before prompting to log in the Labyrinth.")
            .addSlider((slider) =>
                slider
                    .setLimits(1, 5, 1) // Allow values from 1 to 5
                    .setValue(this.plugin.settings.loomDeferralThreshold) // Use the current setting value
                    .onChange(async (value) => {
                        this.plugin.settings.loomDeferralThreshold = value; // Update the setting
                        await this.plugin.saveSettings(); // Save the new setting
                    })
            );
        // --- END NEW ---       
        // --- NEW: Add setting for Labyrinth Decay Factor (L81) ---
        new Setting(containerEl)
            .setName("Labyrinth Decay Factor (L81)")
            .setDesc("Factor for exponential decay in Minotaur calculation. Lower values (e.g., 0.9) make older logs influence the Minotaur less quickly. Higher values (e.g., 0.99) make the decay slower.")
            .addSlider((slider) =>
                slider
                    .setLimits(0.8, 0.99, 0.01) // Reasonable range for decay factor
                    .setValue(this.plugin.settings.labyrinthDecayFactor) // Use the current setting value
                    .setDynamicTooltip() // Show the value as the user moves the slider
                    .onChange(async (value) => {
                        this.plugin.settings.labyrinthDecayFactor = value; // Update the setting
                        await this.plugin.saveSettings(); // Save the new setting
                        console.log(`[Settings] Labyrinth decay factor updated to ${value}. Minotaur will recalculate based on new weights.`);
                        // Optionally, trigger a recalculation of the Minotaur here if desired
                        // this.plugin.lossLogService.recalculateMinotaur();
                    })
            );
        // --- END NEW ---

         // --- NEW: Answer Rubric Settings Section (L94) ---
        new Setting(containerEl)
            .setName("Answer Rubric Settings (L94)")
            .setHeading();

        new Setting(containerEl)
            .setName("Answer Rubric Folder")
            .setDesc("The folder where answer rubric notes are stored. Changes in their frontmatter will trigger the L94 prompt if structure/clarity is low.")
            .addText((text) =>
                text
                    .setPlaceholder("e.g., 60 Answers/")
                    .setValue(this.plugin.settings.answerRubricFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.answerRubricFolder = value.trim().replace(/\/$/, '') + '/'; // Ensure it ends with a '/'
                        await this.plugin.saveSettings();
                        console.log(`[Settings] Answer rubric folder updated to: ${this.plugin.settings.answerRubricFolder}`);
                    })
            );
        // --- END NEW ---

        // --- Ritual Settings ---
new Setting(containerEl)
    .setName("Time Capsule Folder")
    .setDesc("Folder where weekly review notes will be generated.")
    .addText(text => text
        .setPlaceholder("00 Meta/Time Capsules")
        .setValue(this.plugin.settings.timeCapsuleFolder)
        .onChange(async (value) => {
            this.plugin.settings.timeCapsuleFolder = value.trim() || "00 Meta/Time Capsules";
            await this.plugin.saveSettings();
        }));
        
        // --- Quadrant Customization ---
        containerEl.createEl('h3', { text: 'Quadrant Customization' });
        
        QUADRANT_IDS.forEach(qid => {
            new Setting(containerEl)
                .setName(`${qid.charAt(0).toUpperCase() + qid.slice(1)} Name`)
                .addText(text => text
                    .setValue(this.plugin.settings.quadrantNames[qid])
                    .onChange(async (value) => {
                        this.plugin.settings.quadrantNames[qid] = value || qid;
                        await this.plugin.saveSettings();
                         // --- FIX: Use our plugin's event bus ---
                        this.plugin.eventBus.emit('settings-updated'); 
                    }));
            
            new Setting(containerEl)
                .setName(`${qid.charAt(0).toUpperCase() + qid.slice(1)} Color`)
                .addColorPicker(picker => picker
                    .setValue(this.plugin.settings.quadrantColors[qid])
                    .onChange(async (value) => {
                        this.plugin.settings.quadrantColors[qid] = value;
                        await this.plugin.saveSettings();
                        // --- FIX: Use our plugin's event bus ---
                        this.plugin.eventBus.emit('settings-updated');
                    }));         
        });



    }
}