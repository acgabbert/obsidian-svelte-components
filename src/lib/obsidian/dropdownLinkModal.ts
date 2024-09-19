import { App, Modal } from "obsidian";
import ObsidianButton from "../components/DropdownLinkModal.svelte";

export {DropdownLinkModal, type DropdownOption };

interface DropdownOption {
    label: string;
    url: string;
}

class DropdownLinkModal extends Modal {
    dropdownSelector: ObsidianButton | undefined;
    dropdownOptions: DropdownOption[] | undefined;
    title: string;

    constructor(app: App, options: DropdownOption[], title?: string) {
        super(app);
        this.dropdownOptions = options;
        if (title) this.title = title;
        else this.title = "Select an option:";
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