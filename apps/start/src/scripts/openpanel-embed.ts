import iframeResize from '@iframe-resizer/parent';

(() => {
  function initOpenPanelEmbeds() {
    iframeResize(
      {
        license: 'GPLv3', // OpenPanel is AGPL-3.0, compatible with GPL-3.0
        checkOrigin: true,
        log: true, // Enable logging for testing
        onReady(iframe) {
          console.log('iframeResizer ready', iframe);
          const styles = iframe.getAttribute('data-openpanel-styles');
          if (styles) {
            console.log('sending message to load custom styles');
            console.log('styles', styles);
            iframe.iFrameResizer.sendMessage({
              type: 'load-custom-styles',
              opts: { styles },
            });
          }
        },
      },
      'iframe[data-openpanel-embed]',
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOpenPanelEmbeds);
  } else {
    initOpenPanelEmbeds();
  }
})();
