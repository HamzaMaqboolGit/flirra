import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type VideoCallSetupLayoutProps = {
  eyebrow?: string;
  subtitle: string;
  camera: ReactNode;
  preferences: ReactNode;
  action: ReactNode;
  onBack: () => void;
  className?: string;
  cameraClassName?: string;
  preferencesClassName?: string;
};

export default function VideoCallSetupLayout({ eyebrow, subtitle, camera, preferences, action, onBack, className = '', cameraClassName = '', preferencesClassName = '' }: VideoCallSetupLayoutProps) {
  return <section className={`vcd-setup vcd-shared-setup ${className}`}>
    <button type="button" className="vcd-back" onClick={onBack}><ArrowLeft size={16}/> Back</button>
    <header className="vcd-heading">{eyebrow&&<span>{eyebrow}</span>}<h1>Start a Video Call</h1><p>{subtitle}</p></header>
    <div className="vcd-setup-grid">
      <div className={`vcd-camera ${cameraClassName}`}>{camera}</div>
      <article className={`vcd-preferences ${preferencesClassName}`}>{preferences}</article>
    </div>
    <div className="vcd-shared-action">{action}</div>
  </section>;
}
