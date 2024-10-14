import LoadingCode from "$lib/components/LoadingCode.svelte";
import { App, Modal } from "obsidian";

export class ApiResponseModal extends Modal {
    code: Promise<string>;

    constructor(app: App, code: Promise<string>) {
        super(app);
        this.code = code;
    }

    onOpen(): void {
        new LoadingCode({
            target: this.contentEl,
            props: {
                text: this.code
            }
        });
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}