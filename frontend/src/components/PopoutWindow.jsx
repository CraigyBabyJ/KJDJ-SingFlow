import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const PopoutWindow = ({ children, onClose, onWindowReady, title = 'Karaoke Screen' }) => {
  const [container, setContainer] = useState(null);
  const externalWindow = useRef(null);

  useEffect(() => {
    // Open new window with minimal UI
    const win = window.open('', '', 'width=800,height=600,left=200,top=200,location=no,menubar=no,status=no,toolbar=no,scrollbars=no');
    if (!win) {
        console.error("Popup blocked");
        if (onClose) onClose();
        return;
    }
    
    externalWindow.current = win;
    if (onWindowReady) onWindowReady(win);
    win.document.title = title;

    const copyStyles = () => {
        const head = win.document.head;
        const sourceHead = document.head;
        const styleNodes = sourceHead.querySelectorAll('link[rel="stylesheet"], style');
        styleNodes.forEach((node) => {
            try {
                head.appendChild(node.cloneNode(true));
            } catch (err) {
                // Ignore cross-origin styles we can't clone.
            }
        });
    };

    copyStyles();

    // --- HELPER FUNCTIONS ---
    const setWindowSize = (percent) => {
        if (!win) return;
        const screenWidth = win.screen.availWidth;
        const screenHeight = win.screen.availHeight;
        
        let width, height;
        if (percent === 100) {
             width = screenWidth;
             height = screenHeight;
             win.moveTo(0, 0);
        } else {
             width = Math.floor(screenWidth * (percent / 100));
             height = Math.floor(screenHeight * (percent / 100));
        }
        win.resizeTo(width, height);
    };

    const toggleFullscreen = () => {
        if (!win) return;
        if (!win.document.fullscreenElement) {
            win.document.body.requestFullscreen().catch(err => console.error(err));
        } else {
            win.document.exitFullscreen();
        }
    };
    // ------------------------

    const createButton = (text, onClick) => {
        const btn = win.document.createElement('button');
        btn.innerText = text;
        btn.style.padding = '6px 12px';
        btn.style.cursor = 'pointer';
        btn.style.background = 'transparent';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '6px';
        btn.onclick = onClick;
        return btn;
    };

    const menuWrapper = win.document.createElement('div');
    menuWrapper.style.position = 'fixed';
    menuWrapper.style.top = '12px';
    menuWrapper.style.right = '12px';
    menuWrapper.style.zIndex = '9999';

    const menuButton = createButton('...', () => {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });
    menuButton.style.width = '44px';
    menuButton.style.textAlign = 'center';

    const menu = win.document.createElement('div');
    menu.style.position = 'absolute';
    menu.style.right = '0';
    menu.style.top = '40px';
    menu.style.background = '#1f1f1f';
    menu.style.border = '1px solid #444';
    menu.style.borderRadius = '8px';
    menu.style.padding = '6px';
    menu.style.display = 'none';
    menu.style.minWidth = '120px';
    menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';

    const addMenuItem = (label, action) => {
        const item = win.document.createElement('button');
        item.innerText = label;
        item.style.width = '100%';
        item.style.textAlign = 'left';
        item.style.padding = '6px 10px';
        item.style.margin = '2px 0';
        item.style.background = 'transparent';
        item.style.border = 'none';
        item.style.color = 'white';
        item.style.cursor = 'pointer';
        item.onmouseenter = () => { item.style.background = '#333'; };
        item.onmouseleave = () => { item.style.background = 'transparent'; };
        item.onclick = () => {
            action();
            menu.style.display = 'none';
        };
        menu.appendChild(item);
    };

    addMenuItem('25%', () => setWindowSize(25));
    addMenuItem('50%', () => setWindowSize(50));
    addMenuItem('75%', () => setWindowSize(75));
    addMenuItem('100%', () => setWindowSize(100));
    addMenuItem('Fullscreen', toggleFullscreen);
    addMenuItem('Always On Top', () => {
        if (win.__kjdjAlwaysOnTop) {
            win.__kjdjAlwaysOnTop = false;
            menuButton.innerText = '...';
        } else {
            win.__kjdjAlwaysOnTop = true;
            menuButton.innerText = '...';
        }
        try {
            win.blur();
            win.focus();
        } catch (err) {
            console.error(err);
        }
    });

    menuWrapper.appendChild(menuButton);
    menuWrapper.appendChild(menu);
    win.document.body.appendChild(menuWrapper);

    win.document.addEventListener('click', (e) => {
        if (!menuWrapper.contains(e.target)) {
            menu.style.display = 'none';
        }
    });

    // Create container for content
    const div = win.document.createElement('div');
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.display = 'flex';
    div.style.justifyContent = 'center';
    div.style.alignItems = 'center';
    div.style.backgroundColor = 'black';
    div.style.position = 'fixed';
    div.style.inset = '0';
    win.document.body.appendChild(div);
    setContainer(div);

    // Create overlay for state display (next up / idle)
    const overlay = win.document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.pointerEvents = 'none';
    overlay.style.color = '#fff';
    overlay.style.textAlign = 'center';
    overlay.style.fontFamily = 'sans-serif';
    overlay.style.padding = '24px';
    win.document.body.appendChild(overlay);

    // Basic Styles
    win.document.documentElement.style.width = '100%';
    win.document.documentElement.style.height = '100%';
    win.document.body.style.width = '100%';
    win.document.body.style.height = '100%';
    win.document.body.style.margin = '0';
    win.document.body.style.padding = '0';
    win.document.body.style.overflow = 'hidden';
    win.document.body.style.backgroundColor = 'black';

    const toTitleCase = (value) => {
      if (!value || typeof value !== 'string') return '';
      return value
        .split(/\s+/)
        .map((word) => {
          if (!word) return word;
          if (/\d/.test(word)) return word.toUpperCase();
          const lower = word.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
    };

    const renderOverlay = (state) => {
      if (!state || !overlay) return;
      if (state.type === 'KJDJ_STOP') {
        overlay.innerHTML = '';
        return;
      }
      const payload = state.payload || {};
      const { showNextUp, nextUp } = payload;
      if (!showNextUp) {
        overlay.innerHTML = '';
        return;
      }
      if (!nextUp) {
        overlay.innerHTML = '<div style="color:#b3b3b3;font-size:18px;">Waiting for songs...</div>';
        return;
      }
      const title = toTitleCase(nextUp.title || '');
      const artist = toTitleCase(nextUp.artist || '');
      overlay.innerHTML = `
        <div style="text-transform:uppercase;letter-spacing:0.3em;font-size:12px;color:#8fd3c8;">Up Next</div>
        <div style="margin-top:12px;font-size:36px;font-weight:600;">${nextUp.singer_name || ''}</div>
        <div style="margin-top:6px;font-size:18px;color:#e5e5e5;">${title}</div>
        <div style="font-size:12px;color:#9ca3af;">${artist}</div>
      `;
    };

    const handleMessage = (event) => {
      win.__KJDJ_STATE__ = event.data;
      renderOverlay(event.data);
    };
    win.addEventListener('message', handleMessage);

    // Handle close
    const handleBeforeUnload = () => { if (onClose) onClose(); };
    win.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      win.removeEventListener('beforeunload', handleBeforeUnload);
      win.removeEventListener('message', handleMessage);
      win.close();
    };
  }, []); 

  if (!container) return null;
  return createPortal(children, container);
};

export default PopoutWindow;
