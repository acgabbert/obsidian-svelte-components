import { App, Modal } from "obsidian";
import ObsidianButton from "../components/ObsidianButton.svelte";

export {DropdownLinkModal, type DropdownOption };

interface DropdownOption {
    label: string;
    url: string;
}

class DropdownLinkModal extends Modal {
    dropdownSelector: ObsidianButton | undefined;
    dropdownOptions: DropdownOption[] | undefined;
    title: string;

    constructor(app: App, options: DropdownOption[]) {
        super(app);
        this.dropdownOptions = options;
        this.title = "test";
    }

    onOpen(): void {
        if (!this.dropdownOptions) return;
        console.log(this.dropdownOptions);
        this.dropdownSelector = new ObsidianButton({
            target: this.contentEl,
            props: {
                title: this.title,
                options: this.dropdownOptions
            }
        })
    }
}