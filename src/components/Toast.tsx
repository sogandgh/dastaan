import { useToast } from '../context/ToastContext';
import './Toast.css';

export function Toast() {
  const { message, show } = useToast();
  return (
    <div className={`toast${show ? ' show' : ''}`} role="status">{message}</div>
  );
}
