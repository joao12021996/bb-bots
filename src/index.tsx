import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { installRenamer } from "./i18n/rename";

ReactDOM.render(<App />, document.getElementById("root"));
installRenamer();
