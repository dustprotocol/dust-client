import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, EMPTY, Observable, Subscription } from 'rxjs';
import {
  ChainId,
  IBasketHistoricRoi,
  ICreateBasketEntry,
  IGenerateBasketRequest,
  IGenerateBasketResponse,
  IPoolsMetadata,
  IPortfolio,
  QuotePayload,
  Token,
  TokenSymbol,
  Vault,
  VaultAPY,
} from '../models/types';
import { subMonths } from 'date-fns';
import {
  catchError,
  map,
  shareReplay,
  startWith,
  take,
  tap,
} from 'rxjs/operators';
import { combineLatest } from 'rxjs/internal/observable/combineLatest';
import { ConnectorService } from './connector.service';
import { of } from 'rxjs/internal/observable/of';
import { TokenBalanceService } from '../../shared/service/token-balance.service';

const httpOptions = {
  headers: new HttpHeaders({
    'Content-Type': 'application/json',
  }),
};

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  readonly COMPOSITION_LIMIT = 10;
  public pools$ = new BehaviorSubject(null);
  public tokens$ = new BehaviorSubject(null);
  public vaults$ = new BehaviorSubject(null);
  public gasPrices$ = new BehaviorSubject(null);
  private url = environment.reefApiUrl;
  private reefPriceUrl = environment.cmcReefPriceUrl;
  private binanceApiUrl = environment.reefBinanceApiUrl;
  private gasPricesUrl = environment.gasPriceUrl;
  private chartsUrl = `https://charts.hedgetrade.com/cmc_ticker`;
  private reefNodeApi = environment.reefNodeApiUrl;
  private coinGeckoApi = environment.coinGeckoApiUrl;
  //  private balancesByAddr = new Map<string, Observable<any>>();

  // private balancesByAddr = new Map<string, Observable<any>>();

  constructor(
    private readonly http: HttpClient,
    private connectorService: ConnectorService,
    private tokenBalanceService: TokenBalanceService
  ) {
    this.listPools();
    this.listTokens();
    // this.getVaults();
  }

  listPools(): Subscription {
    return this.http
      .get<IPoolsMetadata[]>(`${this.url}/list_pools`)
      .subscribe((pools: IPoolsMetadata[]) => {
        this.pools$.next(pools);
      });
  }

  listTokens(): Subscription {
    return this.http
      .get<{ [key: string]: string }>(`${this.url}/list_tokens`)
      .subscribe((tokens: { [key: string]: string }) => {
        this.tokens$.next(tokens);
      });
  }

  getGasPrices(): Observable<any> {
    return this.http.get(`${this.gasPricesUrl}`);
  }

  generateBasket(
    payload: IGenerateBasketRequest
  ): Observable<IGenerateBasketResponse> {
    if (!payload.amount || !payload.risk_level) {
      return EMPTY;
    }
    return this.http.post<IGenerateBasketResponse>(
      `${this.url}/generate_basket`,
      payload,
      httpOptions
    );
  }

  getHistoricRoi(
    payload: IGenerateBasketResponse,
    subtractMonths: number = 1,
    investedInDate: Date | null = null
  ): Observable<IBasketHistoricRoi> {
    const date = investedInDate || new Date();
    const startDate = subMonths(date, subtractMonths);
    const body = {
      start_date: startDate,
      basket: payload,
    };
    return this.http
      .post<any>(`${this.url}/basket_historic_roi`, body, httpOptions)
      .pipe(catchError(() => EMPTY));
  }

  getCMCReefPrice(): Observable<any> {
    return this.http
      .get<any>(this.reefPriceUrl)
      .pipe(map((res) => res.data.market_pairs[0].quote.USD.price));
  }

  getVaults(): Subscription {
    return combineLatest(this.getAllVaults(), this.getVaultsAPY())
      .pipe(
        map(([vaults, apyVaults]: [Vault, VaultAPY]) => {
          return Object.keys(apyVaults)
            .map((key) => ({
              [key]: {
                ...apyVaults[key],
                APY: +((apyVaults[key].APY - 1) * 100).toFixed(2),
                address: vaults[key] || '',
              },
            }))
            .sort((a, b) => Object.values(b)[0].APY - Object.values(a)[0].APY)
            .reduce((memo, curr) => ({ ...memo, ...curr }));
        }),
        catchError(() => EMPTY)
      )
      .subscribe((vaults) => this.vaults$.next(vaults));
  }

  getAllVaults(): Observable<Vault> {
    return this.http
      .get<Vault>(`${this.url}/list_vaults`)
      .pipe(catchError(() => EMPTY));
  }

  getVaultsAPY(): Observable<VaultAPY> {
    return this.http
      .get<VaultAPY>(`${this.url}/vault_estimate_apy`)
      .pipe(catchError(() => EMPTY));
  }

  registerBinanceUser(email: string, address: string): Observable<any> {
    return this.http
      .post(`${this.binanceApiUrl}/register`, { email, address })
      .pipe(take(1));
  }

  bindBinanceUser(email: string): Observable<any> {
    return this.http
      .post(`${this.binanceApiUrl}/redirect`, { email })
      .pipe(take(1));
  }

  getBindingStatus(address: string): Observable<any> {
    return this.http
      .post(`${this.binanceApiUrl}/bindingStatus`, { address })
      .pipe(take(1));
  }

  getBinanceQuote(params: QuotePayload): Observable<any> {
    const { cryptoCurrency, baseCurrency, requestedAmount, address, email } =
      params;
    return this.http
      .post(`${this.binanceApiUrl}/getQuote`, {
        cryptoCurrency,
        baseCurrency,
        requestedAmount,
        address,
        email,
      })
      .pipe(take(1));
  }

  executeTrade(
    address: string,
    quoteId: string,
    orderId?: string
  ): Observable<any> {
    return this.http
      .post(`${this.binanceApiUrl}/execute`, {
        address,
        quoteId,
        orderId,
      })
      .pipe(take(1));
  }

  getBinanceTransactions(address: string): Observable<any> {
    return this.http
      .post(`${this.binanceApiUrl}/transactions`, { address })
      .pipe(take(1));
  }

  createUserAfterBind(
    email: string,
    address: string,
    userId: string
  ): Observable<any> {
    return this.http
      .post(`${this.binanceApiUrl}/create-user`, {
        email,
        address,
        userId,
      })
      .pipe(take(1));
  }

  checkIfUserRegistered(address: string): Observable<any> {
    return this.http
      .post(`${this.binanceApiUrl}/registrationStatus`, { address })
      .pipe(take(1));
  }

  getReefEthPrice(): Observable<{
    [key: string]: { [key: string]: number };
  }> {
    return this.http
      .get<{ [key: string]: { [key: string]: number } }>(
        `${this.chartsUrl}/BTC,ETH?quote=USD`
      )
      .pipe(catchError((err) => EMPTY));
  }

  /**
   * COVALENT
   */

  /*getTokenBalances$(address: string): Observable<Token[]> {
    if (!address) {
      console.warn('getTokenBalances NO PARAMS');
      return null;
    }
    if (!this.balancesByAddr.has(address)) {
      const refreshForAddr$ = this.refreshBalancesForAddress.pipe(
        startWith(address),
        filter((addr) => addr === address)
      );
      const requestedAddressBalances$ = combineLatest([
        refreshForAddr$,
        this.connectorService.providerUserInfo$,
      ]).pipe(
        switchMap(([addr, info]: [string, IProviderUserInfo]) =>
          this.toBa.getAddressTokenBalances$(addr, info)
        ),
        catchError((err) => {
          throw new Error(err);
        }),
        shareReplay(1)
      );
      const updateBalanceForTokens$: Observable<{
        tokenSymbols: TokenSymbol[];
        isIncludedInBalances: boolean;
      }> = this.updateTokensInBalances.pipe(
        map((t: TokenSymbol[]) => {
          return {
            tokenSymbols: Array.from(new Set(t)),
            isIncludedInBalances: false,
          };
        }),
        startWith(null),
        shareReplay(1)
      );

      const finalBalances$ = combineLatest([
        requestedAddressBalances$,
        updateBalanceForTokens$,
      ]).pipe(
        mergeMap(
          ([cachedBalances, localUpdate]: [
            Token[],
            {
              tokenSymbols: TokenSymbol[];
              isIncludedInBalances: boolean;
            }
          ]) => {
            if (
              !!localUpdate &&
              !!localUpdate.tokenSymbols.length &&
              !localUpdate.isIncludedInBalances
            ) {
              localUpdate.isIncludedInBalances = true;
              const tokenBalances$ = localUpdate.tokenSymbols.map((ts) =>
                this.getBalanceOnChain$(address, ts)
              );
              return combineLatest(tokenBalances$).pipe(
                map((balancesResult: string[]) => {
                  return localUpdate.tokenSymbols.map(
                    (tSymbol: TokenSymbol, sIndex: number) => {
                      return {
                        tokenSymbol: tSymbol,
                        balance: balancesResult[sIndex],
                      };
                    }
                  );
                }),
                map(
                  (
                    updatedTokenResult: {
                      tokenSymbol: TokenSymbol;
                      balance: string;
                    }[]
                  ) => {
                    return cachedBalances.map((tb: Token) => {
                      const updated = updatedTokenResult.find(
                        (upd) => upd.tokenSymbol === tb.contract_ticker_symbol
                      );
                      if (updated) {
                        tb.balance = new BigNumber(
                          updated.balance,
                          10
                        ).toNumber();
                      }
                      return tb;
                    });
                  }
                )
                // tap(v => console.log('UPDATED BALANCE', v))
              );
            }
            return of(cachedBalances);
          }
        ),
        shareReplay(1)
      );
      this.balancesByAddr.set(address, finalBalances$);
    }
    return this.balancesByAddr.get(address);
  }*/

  /*private getAddressTokenBalances$(
    address: string,
    info: IProviderUserInfo
  ): Observable<Token[]> {
    const chainId: ChainId = info.chainInfo.chain_id;
    let balances$: Observable<Token[]>;
    if (ApiService.COVALENT_SUPPORTED_NETWORK_IDS.indexOf(chainId) > -1) {
      balances$ = this.http
        .get<any>(`${this.reefNodeApi}/covalent/${address}/balances`)
        .pipe(tap((v: any[]) => v.forEach((itm) => (itm.address = address))));
    } else {
      balances$ = this.getReefProtocolBalancesFromChain$(info, address).pipe(
        switchMap((val) => this.toCovalentDataStructure(val))
      );
    }

    return balances$.pipe(
      map((tokens) =>
        tokens.map((token) => this.removeTokenPlaceholders(info, token))
      ),
      tap((v) => console.log('VVVV', v))
    );
  }

  private balancesForAddress(requested: Token[], address: string): boolean {
    return requested.length && requested[0].address === address;
  }*/

  /*getTokenBalance$(
    addr: string,
    tokenSymbol?: TokenSymbol,
    tokenAddress?: string
  ): Observable<Token> {
    return this.tokenBalanceService.getTokenBalance$(addr, tokenSymbol, tokenAddress);
    /!*if (!tokenSymbol && !tokenAddress) {
      throw new Error('Token symbol or address is required.');
    }
    return this.tokenBalanceService.getTokenBalances$(addr).pipe(
      switchMap((balances: Token[]) => {
        const tokenBalance = tokenSymbol
          ? this.findTokenBalance(balances, tokenSymbol)
          : null;
        if (tokenBalance) {
          return of(tokenBalance);
        }
        return this.getBalanceOnChain$(addr, tokenSymbol, tokenAddress).pipe(
          map(
            (v) =>
              ({
                balance: parseFloat(v),
                contract_ticker_symbol: tokenSymbol,
                address: addr,
              } as Token)
          )
        );
      }),
      shareReplay(1)
    );*!/
  }*/

  /*private findTokenBalance(balances: Token[], tokenSymbol: TokenSymbol): Token {
    return balances.find((tkn) => {
      if (TokenSymbol[tkn.contract_ticker_symbol] === tokenSymbol) {
        return true;
      }
      return false;
    });
  }
*/

  getTransactions(address: string, chainId: ChainId): any {
    return this.http
      .get<any>(`${this.reefNodeApi}/${chainId}/${address}/transactions`)
      .pipe(
        startWith([]),
        catchError((err) => {
          console.log('transactions', err);
          return of([]);
        })
      );
  }

  getReefPricing(fromAddr: string, to: string): any {
    return this.http.get<any>(
      `${this.reefNodeApi}/reef-pricing?from=${fromAddr}&to=${to}`
    );
  }

  checkIfAuth(code: string): Observable<any> {
    return this.http.post<{ [key: string]: boolean }>(
      `${this.reefNodeApi}/in`,
      { code }
    );
  }

  createBasketEntry(params: ICreateBasketEntry) {
    return this.http.post<ICreateBasketEntry>(
      `${this.reefNodeApi}/basket-invest`,
      { ...params }
    );
  }

  getBasketsForUser(address: string) {
    return this.http
      .get<any>(`${this.reefNodeApi}/baskets?address=${address}`)
      .pipe(map(({ data }) => data));
  }

  /*private removeTokenPlaceholders(info: IProviderUserInfo, token: any): Token {
    if (token.contract_ticker_symbol === 'UNI-V2') {
      const addressLabel = AddressUtils.getAddressLabel(
        info,
        token.contract_address
      );
      token.contract_ticker_symbol = addressLabel || 'Uniswap LP Token';
      token.logo_url =
        'https://logos.covalenthq.com/tokens/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984.png';
    }
    return token;
  }*/

  /*private getBalanceOnChain$(
    address: string,
    tokenSymbol?: TokenSymbol,
    tokenAddress?: string
  ): Observable<string> {
    if (!tokenSymbol && !tokenAddress) {
      throw new Error('Token symbol or address is required.');
    }
    return combineLatest([
      this.connectorService.providerUserInfo$,
      this.connectorService.web3$,
    ]).pipe(
      take(1),
      switchMap(([info, web3]: [IProviderUserInfo, Web3]) => {
        if (tokenSymbol === TokenSymbol.ETH) {
          return web3.eth
            .getBalance(address)
            .then((b) => web3.utils.fromWei(b));
        }
        return this.getContractBalance$(
          info,
          address,
          tokenSymbol,
          tokenAddress
        );
      }),
      // tap(v => console.log('NEW BALANCE for ', tokenSymbol, ' = ', v)),
      catchError((e) => {
        console.warn('ERROR GETTING BALANCE', e);
        return of('0');
      })
    );
  }*/

  /*private getContractBalance$(
    info: IProviderUserInfo,
    address: string,
    tokenSymbol?: TokenSymbol,
    tokenAddress?: string
  ): Promise<string> {
    if (!tokenSymbol && !tokenAddress) {
      throw new Error('Token symbol or address is required.');
    }
    let contract;
    if (tokenSymbol) {
      contract = this.connectorService.createErc20TokenContract(
        tokenSymbol,
        info.availableSmartContractAddresses
      );
    }
    if (!contract && tokenAddress) {
      this.connectorService.createErc20TokenContractFromAddress(tokenAddress);
    }

    if (!contract) {
      throw new Error(
        'No ERC20 contract for' + tokenSymbol + ' cAddr=' + tokenAddress
      );
    }
    return contract.methods
      .balanceOf(address)
      .call()
      .then((balance) => {
        return TokenUtil.toDisplayDecimalValue(balance, tokenSymbol);
      }) as Promise<string>;
  }*/

  /*private getReefProtocolBalancesFromChain$(
    info: IProviderUserInfo,
    address: string
  ): Observable<Token[]> {
    const missingBalanceTokens = ApiService.REEF_PROTOCOL_TOKENS;

    return combineLatest(
      missingBalanceTokens.map((supportedConfig) => {
        let balance$: Observable<any>;
        const tokenAddress =
          info.availableSmartContractAddresses[supportedConfig.tokenSymbol];
        balance$ = this.getBalanceOnChain$(
          address,
          supportedConfig.tokenSymbol
        );

        return balance$.pipe(
          map(
            (balance) =>
              ({
                contract_ticker_symbol: supportedConfig.tokenSymbol,
                balance: +balance,
                address,
                contract_address: tokenAddress,
                logo_url: `https://logos.covalenthq.com/tokens/${tokenAddress}.png`,
              } as Token)
          )
        );
      })
    );
  }*/

  getPriceForAddresses(tokenAddresses: string[], againstCurrecny = 'usd') {
    const addresses = tokenAddresses.toString();
    return this.http.get(
      `${this.coinGeckoApi}/simple/token_price/ethereum?contract_addresses=${addresses}&vs_currencies=${againstCurrecny}`
    );
  }

  private getEthPrice(): Observable<any> {
    return this.http.get(environment.ethPriceUrl);
  }

  private toCovalentDataStructure(
    balancesFromChain: Token[]
  ): Observable<Token[]> {
    const addresses = balancesFromChain.map((token) => token.contract_address);
    const tokensWithPrice$: Observable<Token[]> = this.getPriceForAddresses(
      addresses
    ).pipe(
      map((prices: { [key: string]: { usd: number } }) => {
        return balancesFromChain.map((token) => ({
          ...token,
          quote: prices[token.contract_address]?.usd || 0,
        }));
      })
    );
    return combineLatest(this.getEthPrice(), tokensWithPrice$).pipe(
      map(([ethPrice, tokensWithPrice]: [any, Token[]]) => {
        const eth = tokensWithPrice.find(
          (token) => token.contract_ticker_symbol === TokenSymbol.ETH
        );
        eth.quote = ethPrice?.ethereum?.usd;
        return [
          ...tokensWithPrice.filter(
            (token) => token.contract_ticker_symbol !== TokenSymbol.ETH
          ),
          eth,
        ];
      })
    );
  }
}
