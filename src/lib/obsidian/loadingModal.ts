import LoadingMarkdown from "$lib/components/LoadingMarkdown.svelte";
import { App, Modal } from "obsidian";

export class ApiResponseModal extends Modal {
    text: Promise<string>;

    constructor(app: App, text: Promise<string>) {
        super(app);
        this.text = text;
    }

    onOpen(): void {
        new LoadingMarkdown({
            target: this.contentEl,
            props: {
                text: this.text
            }
        });
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}