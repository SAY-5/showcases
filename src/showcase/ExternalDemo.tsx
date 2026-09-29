import Arrow from './Arrow';

type Props = {
  url: string;
  concept: string;
};

// For a project whose demo is deployed from its own repository: the page
// describes it and links to it rather than embedding another origin.
export default function ExternalDemo({ url, concept }: Props) {
  const host = new URL(url).host;
  return (
    <div className="xdemo">
      <p className="xdemo__kicker mono">Runs at its own address</p>
      <p className="xdemo__concept">{concept}</p>
      <div className="xdemo__row">
        <a className="btn btn--solid" href={url} target="_blank" rel="noopener noreferrer">
          Open the live demo <Arrow className="btn__arrow" />
        </a>
        <span className="xdemo__host mono">{host}</span>
      </div>
      <p className="xdemo__note">
        Deployed from the project&apos;s repository and linked here, not embedded.
      </p>
    </div>
  );
}
