export const THEME_KEY = "profence-theme";

/** Runs before the page paints so there's no flash of the wrong theme. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
