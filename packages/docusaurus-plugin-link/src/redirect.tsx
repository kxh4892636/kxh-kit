import Head from "@docusaurus/Head";
import { useEffect } from "react";
import type { ReactElement } from "react";

export interface LinkRedirectProps {
  target: string;
}

const LinkRedirect = (props: LinkRedirectProps): ReactElement => {
  const { target } = props;

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <Head>
      <meta name="robots" content="noindex" />
      <link rel="canonical" href={target} />
      <meta httpEquiv="refresh" content={`0;url=${target}`} />
    </Head>
  );
};

export default LinkRedirect;
