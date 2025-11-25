// src/modals/LoomGenerationModal.ts

import { App, Modal, Notice, Setting } from 'obsidian';
import MythicMatrixPlugin from '../main'; // ← Add this import


export class LoomGenerationModal extends Modal {
    private topics: string[] = ["", ""];
    private loomType: string = "Triad";
    private onSubmit: (taskText: string) => void;
    private plugin: MythicMatrixPlugin; // ← Add this property
    private initialTopic: string | null = null;

    setInitialTopic(topic: string): this {
  this.initialTopic = topic;
  if (this.topics.length > 0) this.topics[0] = topic;
  return this;
}

    // ADD THIS HELPER
private isValidSyllabusTopic(topicName: string): boolean {
  const file = this.app.metadataCache.getFirstLinkpathDest(topicName, "");
  if (!file) return false;
  const cache = this.app.metadataCache.getFileCache(file);
  const tags = cache?.frontmatter?.tags;
  if (!Array.isArray(tags)) return false;
  return tags.some(tag => /^#gs[1-4]$/.test(tag));
}

    constructor(app: App, onSubmit: (taskText: string) => void) {
  super(app);
  this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: "Generate Weaver's Loom Task" });


        new Setting(contentEl)
            .setName("Loom Type")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('Triad', 'Triad (A+B+C)')
                    .addOption('Tension', 'Tension (A vs B)')
                    .addOption('Evolution', 'Evolution (A → B)')
                    .addOption('Constellation', 'Constellation (Theme across GS1-4)')
                    .onChange(value => this.loomType = value);
            });

        this.topics.forEach((topic, index) => {
            new Setting(contentEl)
                .setName(`Topic ${index + 1}`)
                .addText(text => {
                    text.setPlaceholder("Enter note name (without [[ ]])")
                        .setValue(topic)
                        .onChange(value => this.topics[index] = value);
                });
        });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Generate Task")
                .setCta()
                .onClick(async () => {
                    const validTopics = this.topics.filter(t => t.trim() !== "");
                    if (validTopics.length < 2) {
                        new Notice("Please provide at least two topics.");
                        return;
                    }
                    // 🔥 SYLLABUS VALIDATION
                    for (const topic of validTopics) {
                        const file = this.app.metadataCache.getFirstLinkpathDest(topic, "");
                        if (!file) {
                            new Notice(`Note "${topic}" does not exist.`, 5000);
                            return;
                        }
                        const cache = this.app.metadataCache.getFileCache(file);
                        const tags = cache?.frontmatter?.tags;
                        if (!Array.isArray(tags) || !tags.some(tag => /^#gs[1-4]$/.test(tag))) {
                            new Notice(`"${topic}" lacks #gs1-4 tag.`, 7000);
                            return;
                        }
                    }
                // 🔥 Suggest Fix Principles
const fixPrinciples: string[] = [];
const alchemistLogs = this.app.vault.getMarkdownFiles().filter(f => 
  f.path.startsWith(this.plugin.settings.alchemistLogFolder)
);
for (const log of alchemistLogs) {
  const cache = this.app.metadataCache.getFileCache(log);
  const content = cache?.frontmatter?.fixPrinciple || "";
  if (validTopics.some(topic => content.includes(topic))) {
    fixPrinciples.push(content);
  }
}
if (fixPrinciples.length > 0) {
  new Notice(`💡 Suggested Fix Principle: "${fixPrinciples[0]}"`, 8000);
}         
                    const topicLinks = validTopics.map(t => `[[${t}]]`).join(' ');
                    const taskText = `Synthesize ${topicLinks} (Loom Type: ${this.loomType})`;
                    this.onSubmit(taskText);
                    this.close();
                }));

if (this.initialTopic) {
    this.topics[0] = this.initialTopic;
    // Re-render topic inputs
    this.contentEl.empty();
    this.onOpen(); // Re-call to refresh
  }

    }

    onClose() {
        this.contentEl.empty();
    }
}