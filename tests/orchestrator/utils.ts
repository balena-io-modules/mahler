export function getImageName({
	appUuid,
	releaseUuid,
	serviceName,
}: {
	appUuid: string;
	releaseUuid: string;
	serviceName: string;
}) {
	return `${appUuid}_${serviceName}:${releaseUuid}`;
}

export function getContainerName({
	releaseUuid,
	serviceName,
}: {
	releaseUuid: string;
	serviceName: string;
}) {
	return `${releaseUuid}_${serviceName}`;
}

type ImageNameParts = {
	registry?: string;
	imageName: string;
	tagName?: string;
	digest?: string;
};

// Separate string containing registry and image name into its parts.
// Example: registry2.balena.io/balena/rpi
//          { registry: "registry2.balena.io", imageName: "balena/rpi" }
// Moved here from
// https://github.com/balena-io-modules/docker-toolbelt/blob/master/lib/docker-toolbelt.coffee#L338
export function getRegistryAndName(uri: string): ImageNameParts {
	// https://github.com/docker/distribution/blob/release/2.7/reference/normalize.go#L62
	// https://github.com/docker/distribution/blob/release/2.7/reference/regexp.go#L44
	const imageComponents = uri.match(
		/^(?:(localhost|.*?[.:].*?)\/)?(.+?)(?::(.*?))?(?:@(.*?))?$/,
	);

	if (!imageComponents) {
		throw new Error(`Could not parse the image: ${uri}`);
	}

	const [, registry, imageName, tag, digest] = imageComponents;
	const tagName = !digest && !tag ? 'latest' : tag;
	const digestMatch = digest?.match(
		/^[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*:[0-9a-f-A-F]{32,}$/,
	);
	if (!imageName || (digest && !digestMatch)) {
		throw new Error(
			`Invalid image name, expected [domain.tld/]repo/image[:tag][@digest] format, got: ${uri}`,
		);
	}

	return { registry, imageName, tagName, digest };
}

export function getRepoAndTag(image: string): { repo: string; tag?: string } {
	const { registry, imageName, tagName } = getRegistryAndName(image);

	let repoName = imageName;

	if (registry != null) {
		repoName = `${registry}/${imageName}`;
	}

	return { repo: repoName, tag: tagName };
}
