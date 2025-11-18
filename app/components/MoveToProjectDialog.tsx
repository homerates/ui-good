// ==== REPLACE ENTIRE FILE: app/components/Sidebar.tsx ====
// Sidebar: Clerk-ready, light UI, with streamlined Knowledge Tools section

'use client';

import * as React from 'react';
import {
    SignedIn,
    SignedOut,
    SignInButton,
    UserButton,
} from '@clerk/nextjs';

// Projects list (read-only)
import ProjectsPanel from './ProjectsPanel';
// Move-to-project dialog
import MoveToProjectDialog from './MoveToProjectDialog';

type HistoryItem = { id: string; title: string; updatedAt?: number };

// Knowledge tools you'll wire in from app/page.tsx later
export type KnowledgeToolId =
    | 'mortgage-solutions'
    | 'ask-underwriting';

export type SidebarProps = {
    id?: string;
    history: HistoryItem[];
    activeId: string | null;
    isOpen: boolean;

    onToggle: () => void;

    onSelectHistory: (id: string) => void;
    onHistoryAction: (
        action: 'rename' | 'move' | 'archive' | 'delete',
        id: string
    ) => void;

    onNewChat: () => void;
    onSettings: () => void;
    onShare: () => void; // kept for prop parity (not rendered as a pill)
    onSearch: () => void;
    onLibrary: () => void;
    onNewProject: () => void;
    onMortgageCalc: () => void;

    // Optional intelligence layer hook – safe even if not passed yet
    onKnowledgeTool?: (tool: KnowledgeToolId) => void;
};

export default function Sidebar({
    id,
    history,
    activeId,
    isOpen,
    onToggle,
    onSelectHistory,
    onHistoryAction,
    onNewChat,
    onSettings,
    onShare, // not used in UI (per request), but kept to match page props
    onSearch,
    onLibrary,
    onNewProject,
    onMortgageCalc,
    onKnowledgeTool,
}: SidebarProps) {
    const handleKnowledgeClick = (tool: KnowledgeToolId) => {
        if (onKnowledgeTool) onKnowledgeTool(tool);
    };

    // For now, selecting a project is just logged.
    // Later we can wire this into filtering / loading threads by project.
    const handleSelectProject = React.useCallback((project: any) => {
        // Placeholder hook point
        // console.log('Selected project:', project);
    }, []);

    // Local state for "Move to project" dialog
    const [moveDialogOpen, setMoveDialogOpen] = React.useState(false);
    const [moveDialogThreadId, setMoveDialogThreadId] = React.useState<string | null>(null);

    const handleMoveToProject = React.useCallback(
        (threadId: string) => {
            // Open our custom dialog and remember which thread we're moving
            setMoveDialogThreadId(threadId);
            setMoveDialogOpen(true);

            // IMPORTANT: do NOT call onHistoryAction('move', ...) here anymore,
            // because the parent implementation still uses window.prompt.
            // We'll keep onHistoryAction available for future actions like
            // rename/archive/delete, but "move" is now owned by this dialog.
        },
        []
    );

    const handleCloseMoveDialog = React.useCallback(() => {
        setMoveDialogOpen(false);
        setMoveDialogThreadId(null);
    }, []);

    return (
        <>
            <aside
                id={id}
                className={`sidebar ${isOpen ? 'open' : 'closed'}`}
                aria-label="Sidebar"
            >
                {/* Header: hamburger + brand placeholder */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 12px 8px 12px',
                    }}
                >
                    <button
                        className="hamburger"
                        onClick={onToggle}
                        aria-label={isOpen ? 'Close Sidebar' : 'Open Sidebar'}
                        title={isOpen ? 'Close Sidebar' : 'Open Sidebar'}
                        type="button"
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>

                    <div style={{ height: 0 }} />
                </div>

                {/* Primary actions */}
                <div style={{ display: 'grid', gap: 10, padding: '8px 12px' }}>
                    <button className="btn primary" onClick={onNewChat} type="button">
                        New chat
                    </button>
                    <button className="btn" onClick={onSearch} type="button">
                        Search
                    </button>
                    <button className="btn" onClick={onLibrary} type="button">
                        Library
                    </button>
                    <button className="btn" onClick={onNewProject} type="button">
                        New Project +
                    </button>
                    <button className="btn" onClick={onMortgageCalc} type="button">
                        Mortgage Calculator
                    </button>
                </div>

                {/* Knowledge tools: two portal-style entries */}
                <div
                    style={{
                        padding: '8px 12px',
                        borderTop: '1px solid rgba(0,0,0,0.05)',
                        borderBottom: '1px solid rgba(0,0,0,0.04)',
                        marginTop: 4,
                        marginBottom: 4,
                    }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            opacity: 0.7,
                            marginBottom: 6,
                        }}
                    >
                        Knowledge tools
                    </div>

                    <button
                        className="btn"
                        type="button"
                        style={{ width: '100%', marginBottom: 8 }}
                        onClick={() => handleKnowledgeClick('mortgage-solutions')}
                    >
                        Mortgage Solutions
                    </button>

                    <button
                        className="btn"
                        type="button"
                        style={{ width: '100%', marginBottom: 4 }}
                        onClick={() => handleKnowledgeClick('ask-underwriting')}
                    >
                        Ask Underwriting
                    </button>

                    <div
                        style={{
                            fontSize: 11,
                            opacity: 0.65,
                            marginTop: 4,
                        }}
                    >
                        Portal-style views coming soon
                    </div>
                </div>

                {/* Projects list (ChatGPT-style) */}
                <div
                    style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid rgba(0,0,0,0.04)',
                        marginBottom: 4,
                    }}
                >
                    <ProjectsPanel
                        activeProjectId={null}
                        onSelectProject={handleSelectProject}
                    />
                </div>

                {/* Threads */}
                <div style={{ padding: '8px 12px' }}>
                    {history.length > 0 ? (
                        <div className="chat-list" role="list" aria-label="Chats">
                            {history.map((h) => {
                                const isActive = h.id === activeId;
                                return (
                                    <div
                                        key={h.id}
                                        style={{
                                            display: 'flex',
                                            gap: 8,
                                            alignItems: 'center',
                                            marginBottom: 8,
                                        }}
                                    >
                                        <button
                                            className="chat-item"
                                            role="listitem"
                                            onClick={() => onSelectHistory(h.id)}
                                            aria-current={isActive ? 'true' : 'false'}
                                            title={h.title}
                                            style={{
                                                flex: 1,
                                                textAlign: 'left',
                                                fontWeight: isActive ? 600 : 400,
                                            }}
                                            type="button"
                                        >
                                            {h.title}
                                        </button>
                                        <div className="menu">
                                            <button
                                                className="btn"
                                                aria-label="Move chat to project"
                                                title="Move to project"
                                                onClick={() => handleMoveToProject(h.id)}
                                                type="button"
                                            >
                                                …
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ opacity: 0.7, fontSize: 13 }}>No chats yet</div>
                    )}
                </div>

                {/* Footer: settings + Clerk (no Copy conversation pill) */}
                <div style={{ marginTop: 'auto', padding: '12px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={onSettings} type="button">
                            Settings
                        </button>
                    </div>

                    <div style={{ marginTop: 12 }}>
                        <SignedIn>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <UserButton
                                    showName
                                    appearance={{
                                        elements: {
                                            userButtonOuterIdentifier: { fontWeight: 600 },
                                        },
                                    }}
                                />
                            </div>
                        </SignedIn>

                        <SignedOut>
                            <SignInButton mode="modal">
                                <button className="btn primary" type="button">
                                    Sign in
                                </button>
                            </SignInButton>
                        </SignedOut>
                    </div>
                </div>
            </aside>

            {/* Move-to-project dialog lives outside the sidebar
          so its fixed overlay can cover the whole viewport. */}
            <MoveToProjectDialog
                open={moveDialogOpen}
                threadId={moveDialogThreadId}
                onClose={handleCloseMoveDialog}
                onMoved={undefined}
            />
        </>
    );
}
