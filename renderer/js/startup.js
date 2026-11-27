// Независим от EMB: ошибки загрузки остальных сценариев не оставляют пустое окно.
(function () {
  window.EMBER_STARTUP = {
    showError(error, fatal = false) {
      // После успешной загрузки обычные ошибки UI не заменяют работающий интерфейс.
      // Если упал первый рендер, оставляем титульбар с кнопками и показываем ошибку во view.
      const message = document.getElementById('startup-message') || (fatal && document.getElementById('view'));
      if (message) {
        message.textContent = `Не удалось запустить интерфейс: ${error.message || error}`;
        message.setAttribute('role', 'alert');
      }
    },
  };
  document.getElementById('startup-reload').addEventListener('click', () => window.location.reload());
  document.getElementById('startup-close').addEventListener('click', () => {
    if (window.ember) window.ember.win.close();
    else window.close();
  });
  window.addEventListener('error', event => {
    const source = event.target && event.target.src;
    window.EMBER_STARTUP.showError(event.error || event.message || `Не удалось загрузить ${source || 'файл интерфейса'}`);
  }, true);
})();
