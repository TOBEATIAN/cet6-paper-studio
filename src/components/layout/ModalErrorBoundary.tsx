import { Component, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { primaryBtn, secondaryBtn } from "../../lib/ui/styles";

interface Props {
  children: ReactNode;
  title: string;
  message: string;
  closeLabel: string;
  backLabel: string;
  retryLabel: string;
  onClose: () => void;
}

interface State {
  error: Error | null;
}

/** Keeps a modal render failure recoverable instead of blanking the workbench. */
export class ModalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return createPortal(
      <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={this.props.title}
          className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{this.props.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {this.props.message}
              </p>
              <p className="mt-2 break-words text-xs text-destructive">
                {this.state.error.message}
              </p>
            </div>
            <button
              type="button"
              aria-label={this.props.closeLabel}
              onClick={this.props.onClose}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className={secondaryBtn}
            >
              <RotateCcw className="h-4 w-4" />
              {this.props.retryLabel}
            </button>
            <button
              type="button"
              onClick={this.props.onClose}
              className={primaryBtn}
            >
              {this.props.backLabel}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }
}
