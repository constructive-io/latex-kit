import './style.css';

import { createRoot } from 'react-dom/client';

import { Place } from './Place';
import { Sign } from './Sign';

// /sign/<token> is the signing page; /place/<key> is for drawing fields on a PDF.
const [mode, id] = location.pathname.split('/').filter(Boolean);
createRoot(document.getElementById('root')!).render(mode === 'place' ? <Place id={id} /> : <Sign token={id} />);
