// Error boundary so one broken panel/dialog never takes the whole game down.
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { name: string; children: ReactNode; onClose?: () => void; inline?: boolean }
interface State { error: Error | null }

export default class SafeBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ui] ${this.props.name} crashed`, error, info.componentStack)
  }
  private reset = () => this.setState({ error: null })
  render() {
    if (!this.state.error) return this.props.children
    if (this.props.inline) {
      return (
        <div className="m-oops-inline" role="alert">
          <span>😵 {this.props.name} hiccuped.</span>
          <button className="k-btn ghost sm" onClick={this.reset}>Retry</button>
        </div>
      )
    }
    return (
      <div className="k-backdrop">
        <div className="k-panel k-dialog m-oops" role="alertdialog">
          <div className="k-dialog-head">
            <div style={{ fontSize: 34, lineHeight: 1 }}>🫠</div>
            <div>
              <h2 className="k-dialog-title">This panel spilled its fries</h2>
              <div className="k-dialog-sub">{this.props.name} hit a snag. Your game is safe; close this and carry on.</div>
            </div>
          </div>
          <div className="k-dialog-body"><code className="m-oops-msg">{String(this.state.error.message || this.state.error)}</code></div>
          <div className="k-dialog-foot">
            <button className="k-btn secondary" onClick={this.reset}>Try again</button>
            {this.props.onClose && <button className="k-btn primary" onClick={() => { this.reset(); this.props.onClose?.() }}>Close</button>}
          </div>
        </div>
      </div>
    )
  }
}
