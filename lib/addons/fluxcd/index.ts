// lib/fluxcd_addon.ts
import { Construct } from 'constructs';
import merge from "ts-deepmerge";
import { ClusterInfo, Values } from "../../spi";
import { createNamespace } from "../../utils";
import { HelmAddOn, HelmAddOnProps, HelmAddOnUserProps } from "../helm-addon";
import { FluxGitRepository } from "./gitrepository";
import * as spi from "../../spi";
import { KubernetesManifest } from 'aws-cdk-lib/aws-eks/lib/k8s-manifest';
/**
 * User provided options for the Helm Chart
 */
export interface FluxCDAddOnProps extends HelmAddOnUserProps {
  /**
   * To Create Namespace using CDK
   */    
  createNamespace?: boolean;

  /**
   * Optional values for `GitRepository` Source to produce an Artifact for a Git repository revision.
   */
  bootstrapRepo?: spi.ApplicationRepository;

  /*
  * Internal for Flux sync.
  * Default `5m0s` */

  fluxSyncInterval?: string;
}

/**
 * Default props to be used when creating the Helm chart
 */
const defaultProps: HelmAddOnProps & FluxCDAddOnProps = {
  name: "fluxcd-addon",
  namespace: "flux-system",
  chart: "flux2",
  version: "2.7.0",
  release: "blueprints-fluxcd-addon",
  repository: "https://fluxcd-community.github.io/helm-charts",
  values: {},
  createNamespace: true,
  fluxSyncInterval: "5m0s"
};

/**
 * Main class to instantiate the Helm chart
 */
export class FluxCDAddOn extends HelmAddOn {

  readonly options: FluxCDAddOnProps;

  constructor(props?: FluxCDAddOnProps) {
    super({...defaultProps, ...props});
    this.options = this.props as FluxCDAddOnProps;
  }

  deploy(clusterInfo: ClusterInfo): Promise<Construct> {
    const cluster = clusterInfo.cluster;
    let values: Values = this.options.values ?? {};
    values = merge(values, this.props.values ?? {});
    const chart = this.addHelmChart(clusterInfo, values);

    if( this.options.createNamespace == true){
      // Let CDK Create the Namespace
      const namespace = createNamespace(this.options.namespace! , cluster);
      chart.node.addDependency(namespace);
    }

    //Lets create a GitRepository resource as a source to Flux
    if (this.options.bootstrapRepo) {
      const construct = createGitRepository(clusterInfo, this.options.bootstrapRepo, this.options);
      construct.node.addDependency(chart);
    }
    return Promise.resolve(chart);
  }
}

/**
 * createGitRepository calls the FluxGitRepository().generate to create GitRepostory resource.
 */
function createGitRepository(clusterInfo: ClusterInfo, bootstrapRepo: spi.ApplicationRepository, fluxcdAddonProps: FluxCDAddOnProps): KubernetesManifest {
  const manifest = new FluxGitRepository(bootstrapRepo).generate(fluxcdAddonProps.namespace!, fluxcdAddonProps.fluxSyncInterval!);
  let manifestName: string | undefined = fluxcdAddonProps.name;
  const construct = clusterInfo.cluster.addManifest(manifestName!, manifest);
  return construct;
}