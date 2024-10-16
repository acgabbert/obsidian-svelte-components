import { App, Modal } from "obsidian";
import DropdownSelector from "../components/DropdownSelector.svelte";

export {DropdownLinkModal, type DropdownOption };

interface DropdownOption {
    label: string;
    url: string;
}

class DropdownLinkModal extends Modal {
    dropdownSelector: DropdownSelector | undefined;
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
        this.dropdownSelector = new DropdownSelector({
            target: this.contentEl,
            props: {
                title: this.title,
                options: this.dropdownOptions
            }
        });
    }
}