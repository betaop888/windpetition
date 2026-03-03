import RawTemplatePage from "../components/RawTemplatePage";
import { loadHtmlTemplate } from "../lib/template-loader";

export default function RegistryDetailPage(props) {
  return <RawTemplatePage {...props} />;
}

export function getStaticProps() {
  return {
    props: loadHtmlTemplate("registry-detail.html", "registry-detail"),
  };
}
