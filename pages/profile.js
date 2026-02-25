import RawTemplatePage from "../components/RawTemplatePage";
import { loadHtmlTemplate } from "../lib/template-loader";

export default function ProfilePage(props) {
  return <RawTemplatePage {...props} />;
}

export function getStaticProps() {
  return {
    props: loadHtmlTemplate("profile.html", "profile"),
  };
}
