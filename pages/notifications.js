import RawTemplatePage from "../components/RawTemplatePage";
import { loadHtmlTemplate } from "../lib/template-loader";

export default function NotificationsPage(props) {
  return <RawTemplatePage {...props} />;
}

export function getStaticProps() {
  return {
    props: loadHtmlTemplate("notifications.html", "notifications"),
  };
}
