import Head from "next/head";
import Script from "next/script";

export default function RawTemplatePage({ bodyHtml, pageId, title }) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="page-id" content={pageId} />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <Script src="/app.js" strategy="beforeInteractive" />
    </>
  );
}
