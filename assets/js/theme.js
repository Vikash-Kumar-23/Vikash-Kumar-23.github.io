document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('theme-toggle');
  
  // Set initial icon based on current theme
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  themeToggle.textContent = currentTheme === 'dark' ? '☀' : '🌙';

  themeToggle.addEventListener('click', () => {
    let theme = document.documentElement.getAttribute('data-theme');
    
    if (theme === 'dark') {
      theme = 'light';
      themeToggle.textContent = '🌙';
    } else {
      theme = 'dark';
      themeToggle.textContent = '☀';
    }
    
    // Apply theme
    document.documentElement.setAttribute('data-theme', theme);
    // Save to localStorage
    localStorage.setItem('theme', theme);
  });
});
