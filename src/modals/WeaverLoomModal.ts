// src/modals/WeaverLoomModal.ts

import { App, Modal, Notice, TextAreaComponent } from 'obsidian';
import { SynthesisService, LoomTaskDetails, SynthesisContent } from '../services/SynthesisService';
import MythicMatrixPlugin from '../main'; // ← ADD THIS IMPORT


const SCAFFOLDS: Record<string, string[]> = {
    "triad": ["Common Principle", "Synergistic Outcome", "UPSC Application"],
    "tension": ["Core Point of Conflict", "Balancing Principle", "Real-World Manifestation"],
    "evolution": ["Causative Factors", "Key Turning Points", "Future Trajectory"],
    "constellation": ["GS1: Society/Geography", "GS2: Polity/Governance", "GS3: Economy/Tech", "GS4: Ethics"]
};

export class WeaverLoomModal extends Modal {
    private details: LoomTaskDetails;
    private synthesisService: SynthesisService;
    private synthesisContent: SynthesisContent = {};
    private plugin: MythicMatrixPlugin; // ← DECLARE PROPERTY

    private onSaveCallback?: () => Promise<void>;

    constructor(app: App, details: LoomTaskDetails, synthesisService: SynthesisService, plugin: MythicMatrixPlugin, onSaveCallback?: () => Promise<void>) {
        super(app);
        this.details = details;
        this.synthesisService = synthesisService;
        this.plugin = plugin; // ← STORE IT
        this.onSaveCallback = onSaveCallback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mythic-matrix-modal');

        contentEl.createEl('h2', { text: `Weave Your Insight: ${this.details.loomType}` });
        contentEl.createEl('p', { text: `Topics: ${this.details.topics.map(t => `[[${t}]]`).join(', ')}` });

        const prompts = SCAFFOLDS[this.details.loomType] || ["Core Insight", "Key Supporting Points"];
        prompts.forEach(prompt => {
            this.synthesisContent[prompt] = "";
            contentEl.createEl('h4', { text: prompt });
            new TextAreaComponent(contentEl)
                .setPlaceholder(`Detail the "${prompt}" here...`)
                .setValue("")
                .onChange(value => this.synthesisContent[prompt] = value)
                .inputEl.setCssStyles({ width: '100%', minHeight: '120px', marginBottom: '1rem' });
const textArea = contentEl.createEl('textarea', {
  attr: { placeholder: 'Detail the insight...' }
});
textArea.oninput = () => {
  this.synthesisContent['Custom Field'] = textArea.value;
};
    updateDepthMeter(); // ← LIVE UPDATE
  });  

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '10px';
        btnContainer.style.marginTop = '20px';

        // 🔥 Only show "Synthesize Later" if NOT already deferred
        if (!this.onSaveCallback) {
            btnContainer.createEl('button', { text: 'Synthesize Later' })
                .onclick = () => {
                    this.synthesisService.deferSynthesis(this.details);
                    this.close();
                };
        }

        btnContainer.createEl('button', { text: 'Synthesize Now', cls: 'mod-cta' })
            .onclick = async () => {
                await this.synthesisService.createSynthesisNote(this.details, this.synthesisContent);
                if (this.onSaveCallback) await this.onSaveCallback();
                this.close();
            };

const depthLabel = contentEl.createEl('div', { cls: 'loom-depth-meter' });
depthLabel.style.cssText = 'margin-top: 10px; font-size: 0.9em; color: var(--text-muted);';

// Update on content change
const updateDepthMeter = () => {
  const filled = Object.values(this.synthesisContent).filter(v => v.trim()).length;
  const labels = ["Surface Weave", "Light Weave", "Medium Weave", "Dense Weave", "Dense Tapestry"];
  depthLabel.setText(`Depth: ${labels[Math.min(filled, 4)]}`);
};
updateDepthMeter();

// src/modals/WeaverLoomModal.ts → inside onOpen()
const suggestBtn = contentEl.createEl('button', { text: "Suggest Case Studies" });
suggestBtn.onclick = async () => {
  const key = "Real-World Manifestation"; // or whatever your scaffold key is  
  const caseStudies: string[] = [];
  const allNotes = this.app.vault.getMarkdownFiles();
  for (const note of allNotes) {
    const cache = this.app.metadataCache.getFileCache(note);
    const tags = (cache?.frontmatter?.tags as string[]) || [];
    if (tags.some(tag => tag === "#case-study" || tag === "#current-affairs")) {
      const content = await this.app.vault.read(note);
      // ✅ Use this.details.topics (not bare 'details')
      if (this.details.topics.some(t => content.includes(t))) {
        caseStudies.push(`[[${note.basename}]]`);
      }
    }
  }
  if (caseStudies.length > 0) {
    // ✅ Use this.manifestationContent (not bare 'manifestationContent')
this.synthesisContent[key] = (this.synthesisContent[key] || "") + `\nSuggested: ${caseStudies.join(', ')}`;    // Refresh UI (or use state binding)
  }
};


        if (this.plugin.settings.enableLoomRituals) {
  // Dim background
  const backdrop = this.modalEl.createDiv("loom-ritual-backdrop");
  backdrop.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.7);
    z-index: -1;
  `;
  
  // Full-screen content
  this.contentEl.style.cssText = `
    background: var(--background-primary);
    border: none;
    box-shadow: none;
    max-width: 90vw;
    max-height: 90vh;
    padding: 2rem;
  `;
}    
    }

    onClose() {
        this.contentEl.empty();
    }
}