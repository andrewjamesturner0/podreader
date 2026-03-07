import './ProgressIndicator.css';

interface Props {
  message: string;
}

export default function ProgressIndicator({ message }: Props) {
  return (
    <div className="progress-indicator">
      <div className="spinner" />
      <span>{message}</span>
    </div>
  );
}
