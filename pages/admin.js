import RawTemplatePage from "../components/RawTemplatePage";
import { loadHtmlTemplate } from "../lib/template-loader";

export default function AdminPage(props) {
  return <RawTemplatePage {...props} />;
}

export function getStaticProps() {
  return {
    props: loadHtmlTemplate("admin.html", "admin"),
  };
}
