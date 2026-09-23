/**
 * ISPAgent WebChat Embeddable Widget v2.0
 * 
 * Como usar no seu site:
 * <script src="https://seu-dominio.com.br/widget.js" data-tenant="tnt_vibe" data-title="Vibe Telecom"></script>
 */
(function () {
  'use strict';

  // Localiza a tag do script para ler os parâmetros de configuração
  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var tenantId = currentScript ? (currentScript.getAttribute('data-tenant') || 'tnt_vibe') : 'tnt_vibe';
  var botTitle = currentScript ? (currentScript.getAttribute('data-title') || 'Vibe Telecom') : 'Vibe Telecom';
  var primaryColor = currentScript ? (currentScript.getAttribute('data-color') || '#0891b2') : '#0891b2';
  var position = currentScript ? (currentScript.getAttribute('data-position') || 'right') : 'right';

  // Base URL do serviço (usa a mesma origem do script ou localhost em dev)
  var scriptUrl = currentScript && currentScript.src ? new URL(currentScript.src) : window.location;
  var baseUrl = scriptUrl.origin;

  // Cria ID único da sessão do visitante no localStorage para manter a conversa ativa ao navegar pelas páginas
  var storageKey = 'ispagent_session_' + tenantId;
  var visitorSessionId = '';
  try {
    visitorSessionId = localStorage.getItem(storageKey);
    if (!visitorSessionId) {
      visitorSessionId = 'widget_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(storageKey, visitorSessionId);
    }
  } catch (e) {
    visitorSessionId = 'widget_' + Math.random().toString(36).substring(2, 10);
  }

  // Estilos CSS do Widget
  var styles = document.createElement('style');
  styles.innerHTML = `
    .ispagent-launcher {
      position: fixed;
      bottom: 24px;
      ${position === 'left' ? 'left: 24px;' : 'right: 24px;'}
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${primaryColor}, #2563eb);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999998;
      transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease;
      border: 2px solid rgba(255, 255, 255, 0.2);
    }
    .ispagent-launcher:hover {
      transform: scale(1.08);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
    }
    .ispagent-launcher svg {
      width: 28px;
      height: 28px;
      fill: #ffffff;
      transition: transform 0.2s ease;
    }
    .ispagent-container {
      position: fixed;
      bottom: 96px;
      ${position === 'left' ? 'left: 24px;' : 'right: 24px;'}
      width: 400px;
      height: 620px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 120px);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: #020617;
      z-index: 999999;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ispagent-container.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .ispagent-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
    @media (max-width: 480px) {
      .ispagent-container {
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100vw;
        height: 100vh;
        max-width: 100vw;
        max-height: 100vh;
        border-radius: 0;
        border: none;
      }
      .ispagent-launcher {
        bottom: 16px;
        ${position === 'left' ? 'left: 16px;' : 'right: 16px;'}
      }
    }
  `;
  document.head.appendChild(styles);

  // Cria o Container e o Iframe do WebChat
  var container = document.createElement('div');
  container.className = 'ispagent-container';

  var iframe = document.createElement('iframe');
  iframe.className = 'ispagent-iframe';
  iframe.title = botTitle + ' - Atendimento Inteligente';
  iframe.src = baseUrl + '/webchat?as=' + encodeURIComponent(visitorSessionId);
  container.appendChild(iframe);
  document.body.appendChild(container);

  // Cria o Botão Flutuante (Launcher)
  var launcher = document.createElement('button');
  launcher.className = 'ispagent-launcher';
  launcher.setAttribute('aria-label', 'Abrir chat de atendimento ' + botTitle);

  var chatIcon = `
    <svg viewBox="0 0 24 24">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
    </svg>
  `;

  var closeIcon = `
    <svg viewBox="0 0 24 24">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  `;

  launcher.innerHTML = chatIcon;
  document.body.appendChild(launcher);

  // Alterna exibição do chat ao clicar
  var isOpen = false;
  launcher.addEventListener('click', function () {
    isOpen = !isOpen;
    if (isOpen) {
      container.classList.add('open');
      launcher.innerHTML = closeIcon;
    } else {
      container.classList.remove('open');
      launcher.innerHTML = chatIcon;
    }
  });

  // Ouve mensagens postMessage do iframe caso queira fechar programaticamente
  window.addEventListener('message', function (event) {
    if (event.data === 'ispagent:close') {
      isOpen = false;
      container.classList.remove('open');
      launcher.innerHTML = chatIcon;
    }
  });
})();
