import addresses from './contracts'

export const getAddress = (address?: { [chainId: number]: string }, chainId?: number): string => {
  // If address is provided and chainId matches, return the specific address
  if (address && chainId) {
    return address[chainId];
  }

  // If address is provided but chainId is not, return the default address
  if (address) {
    return address[11155111];
  }

  // If address is not provided, return an empty string
  return '';
};
export const getWethAddress = (chainId?: number) => {
  return getAddress(addresses?.WETHAddress, chainId)
}
export const getMulticallAddress = (chainId?: number) => {
  return getAddress(addresses?.multicallAddress, chainId)
}
export const getFactoryAddress = (chainId?: number) => {
  return getAddress(addresses?.factoryAddress, chainId)
}
export const getRouterAddress = (chainId?: number) => {
  return getAddress(addresses?.routerAddress, chainId)
}
export const getSwapRouterV3Address = (chainId?: number) => {
  return getAddress(addresses?.swapRouterV3Address, chainId)
}
export const getQuoterV2Address = (chainId?: number) => {
  return getAddress(addresses?.quoterV2Address, chainId)
}
export const getDefaultAddress = () => {
  return getAddress(addresses?.defaultAddress)
}
