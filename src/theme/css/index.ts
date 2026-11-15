// The site's styles, in the order they're loaded: where two rules are otherwise equal, the later file wins. So the
// polish pass (one set of tokens, form controls, buttons) and the light theme come last.
// Dark by default; which theme shows is ⚙️ Settings > Theme, set as data-theme on <html>.
import "./base.css";
import "./player-mode.css";
import "./house.css";
import "./online.css";
import "./comps.css";
import "./screens.css";
import "./career.css";
import "./setup.css";
import "./polish.css";
import "./light.css";
