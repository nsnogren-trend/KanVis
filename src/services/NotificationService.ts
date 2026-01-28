/**
 * NotificationService - Sending messages between windows
 */

import * as vscode from 'vscode';
import { CardId, WindowId } from '../types/index.js';
import { StateManager } from '../core/StateManager.js';

/**
 * NotificationService handles cross-window notifications
 */
export class NotificationService implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private notificationShown = false;

    constructor(
        private readonly stateManager: StateManager,
        private readonly currentWindowId: WindowId
    ) {
        this.setupListeners();
    }

    /**
     * Set up event listeners for notifications
     */
    private setupListeners(): void {
        // Listen for state changes to check for new notifications
        this.disposables.push(
            this.stateManager.onStateChange((state) => {
                this.checkForNotifications(state);
            })
        );
    }

    /**
     * Check for notifications targeted at this window
     */
    private checkForNotifications(state: import('../types/index.js').KanVisState): void {
        // Find the card for this window
        const card = state.cards.find(
            (c) => c.id === (this.currentWindowId as unknown as CardId)
        );

        if (!card?.notification || this.notificationShown) {
            return;
        }

        // Show the notification
        const message = card.notification.message;
        const fromWindowId = card.notification.fromWindowId;
        
        // Find sender's card name
        let senderName = 'Another window';
        if (fromWindowId) {
            const senderCard = state.cards.find((c) => c.id === (fromWindowId as unknown as CardId));
            if (senderCard) {
                senderName = senderCard.name;
            }
        }

        this.notificationShown = true;

        vscode.window
            .showInformationMessage(
                `Message from ${senderName}: ${message}`,
                'Dismiss'
            )
            .then(() => {
                // Clear the notification when dismissed
                this.clearNotification();
            });
    }

    /**
     * Send a notification to another window
     */
    async sendNotification(targetCardId: CardId, message: string): Promise<void> {
        await this.stateManager.setNotification(targetCardId, message, this.currentWindowId);
    }

    /**
     * Clear notification for this window
     */
    async clearNotification(): Promise<void> {
        this.notificationShown = false;
        await this.stateManager.clearNotification(this.currentWindowId as unknown as CardId);
    }

    /**
     * Check if this window has an active notification
     */
    hasNotification(): boolean {
        const state = this.stateManager.getState();
        const card = state.cards.find(
            (c) => c.id === (this.currentWindowId as unknown as CardId)
        );
        return !!card?.notification;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}

