import { App } from "obsidian";
import type { OcrProvider, ParsedIndicators } from "obsidian-cyber-utils";

export type OcrProgressCallback = (completed: number, total: number, results: Map<string, ParsedIndicators[]>, cancelled?: boolean) => void;

/**
 * Configurable OcrProvider wrapper that supports parallel processing with progress updates
 */
export class ParallelOcrProvider implements OcrProvider {
    private baseProvider: OcrProvider;
    private progressCallback: OcrProgressCallback | null = null;
    private maxConcurrent: number;
    
    /**
     * Create a new ParallelOcrProvider
     * 
     * @param baseProvider The underlying OCR provider to use
     * @param maxConcurrent Maximum number of files to process concurrently (defaults to 3)
     * @param progressCallback Optional callback for progress updates
     */
    constructor(
        baseProvider: OcrProvider, 
        maxConcurrent: number = 3,
        progressCallback?: OcrProgressCallback
    ) {
        this.baseProvider = baseProvider;
        this.maxConcurrent = Math.max(1, maxConcurrent);
        this.progressCallback = progressCallback || null;
    }
    
    /**
     * Check if the underlying OCR provider is ready
     */
    isReady(): boolean {
        return this.baseProvider.isReady();
    }
    
    /**
     * Process files in parallel batches, with progress updates
     */
    async processFiles(app: App, filePaths: string[]): Promise<Map<string, ParsedIndicators[]>> {
        const results = new Map<string, ParsedIndicators[]>();
        
        // If the provider is not ready or there are no files, return empty results
        if (!this.isReady() || filePaths.length === 0) {
            return results;
        }
        
        // Track completed files
        let completedCount = 0;
        const totalFiles = filePaths.length;
        
        // Process files in batches of maxConcurrent
        for (let i = 0; i < filePaths.length; i += this.maxConcurrent) {
            const batchFiles = filePaths.slice(i, i + this.maxConcurrent);
            
            // Create an array of promises for each file in the batch
            const batchPromises = batchFiles.map(async (filePath) => {
                try {
                    // Process a single file using the base provider
                    const singleFileResult = await this.baseProvider.processFiles(app, [filePath]);
                    
                    // Increment completed count and update progress
                    completedCount++;
                    
                    return { path: filePath, result: singleFileResult };
                } catch (error) {
                    console.error(`Error processing file ${filePath}:`, error);
                    
                    // Still increment completed count even for failures
                    completedCount++;
                    
                    return { path: filePath, result: new Map<string, ParsedIndicators[]>() };
                }
            });
            
            // Wait for all files in this batch to complete
            const batchResults = await Promise.all(batchPromises);
            
            // Add batch results to our accumulated results
            for (const { path, result } of batchResults) {
                for (const [filePath, indicators] of result.entries()) {
                    results.set(filePath, indicators);
                }
            }
            
            // Call progress callback after each batch if provided
            if (this.progressCallback) {
                this.progressCallback(completedCount, totalFiles, new Map(results));
            }
        }
        
        return results;
    }
    
    /**
     * Set a new progress callback
     */
    setProgressCallback(callback: OcrProgressCallback | null): void {
        this.progressCallback = callback;
    }
    
    /**
     * Change the maximum number of concurrent files
     */
    setMaxConcurrent(maxConcurrent: number): void {
        this.maxConcurrent = Math.max(1, maxConcurrent);
    }
    
    /**
     * Get the underlying provider
     */
    getBaseProvider(): OcrProvider {
        return this.baseProvider;
    }
}