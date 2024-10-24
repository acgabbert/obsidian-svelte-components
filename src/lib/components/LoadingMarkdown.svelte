<script lang="ts">  
    import { marked } from 'marked'
    export let text: Promise<string>;
</script>

{#await text}
    Loading... <div class="spinner"></div>
{:then text} 
    <div class="markdown-preview">{@html marked(text)}</div>
{/await}

<style>
    .spinner {
        border: 4px solid #000000;
        border-top: 4px solid #ffffff;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .markdown-preview {
        user-select: text;
        word-wrap: break-word;
        white-space: pre-line;
    }
</style>  