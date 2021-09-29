import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  catchError,
  filter,
  map,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs/operators';
import { UniswapService } from '../../../../core/services/uniswap.service';
import { BehaviorSubject, combineLatest, EMPTY, Observable, of } from 'rxjs';
import {
  IProviderUserInfo,
  IReefPricePerToken,
  PendingTransaction,
  Token,
  TokenSymbol,
  TransactionType,
} from '../../../../core/models/types';
import { first } from 'rxjs/internal/operators/first';
import BigNumber from 'bignumber.js';
import { ConnectorService } from '../../../../core/services/connector.service';
import { ApiService } from '../../../../core/services/api.service';
import { Contract } from 'web3-eth-contract';
import { AddressUtils } from '../../../../shared/utils/address.utils';
import { TokenUtil } from '../../../../shared/utils/token.util';
import { TransactionsService } from '../../../../core/services/transactions.service';
import { TokenBalanceService } from '../../../../shared/service/token-balance.service';

@Component({
  selector: 'app-pool-page',
  templateUrl: './pool.page.html',
  styleUrls: ['./pool.page.scss'],
})
export class PoolPage {
  TransactionType = TransactionType;
  readonly token$: Observable<TokenSymbol> = this.route.params.pipe(
    map((params) => TokenSymbol[params.token]),
    filter((v) => !!v),
    shareReplay(1)
  );
  readonly providerUserInfo$ = this.connectorService.providerUserInfo$;
  readonly error$ = new BehaviorSubject<boolean>(false);
  readonly pendingTransactions$ =
    this.transactionService.getPendingTransactions([
      TransactionType.LIQUIDITY_USDT,
      TransactionType.LIQUIDITY_ETH,
    ]);
  public reefContract$: Observable<Contract | null>;
  public lpTokenContract$: Observable<Contract | null>;
  public pricePerTokens$: Observable<IReefPricePerToken | null> = of(null);
  public reefAmount = 0;
  public tokenAmount = 0;
  public loading = false;
  TokenSymbol = TokenSymbol;
  tokenBalanceReef$: Observable<Token>;
  tokenBalanceReefOposite$: Observable<Token>;
  TokenUtil = TokenUtil;
  private wasLastCalcForToken: boolean;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly uniswapService: UniswapService,
    private readonly connectorService: ConnectorService,
    public apiService: ApiService,
    private readonly transactionService: TransactionsService,
    public tokenBalanceService: TokenBalanceService
  ) {
    this.tokenBalanceReefOposite$ = combineLatest([
      this.token$,
      this.providerUserInfo$,
    ]).pipe(
      switchMap(([tokenSymbol, uInfo]: [TokenSymbol, IProviderUserInfo]) =>
        this.tokenBalanceService.getTokenBalance$(
          uInfo.address,
          TokenSymbol[tokenSymbol]
        )
      ),
      shareReplay(1)
    );
    this.tokenBalanceReef$ = this.providerUserInfo$.pipe(
      switchMap((uInfo: IProviderUserInfo) =>
        this.tokenBalanceService.getTokenBalance$(
          uInfo.address,
          TokenSymbol.REEF
        )
      ),
      shareReplay(1)
    );

    this.lpTokenContract$ = combineLatest([
      this.token$,
      connectorService.providerUserInfo$,
    ]).pipe(
      map(([token, info]: [TokenSymbol, IProviderUserInfo]) =>
        this.connectorService.createErc20TokenContract(
          token as TokenSymbol,
          info.availableSmartContractAddresses
        )
      ),
      shareReplay(1)
    );
    this.reefContract$ = this.providerUserInfo$.pipe(
      map((info) =>
        this.connectorService.createErc20TokenContract(
          TokenSymbol.REEF,
          info.availableSmartContractAddresses
        )
      ),
      shareReplay(1)
    );

    this.pricePerTokens$ = this.token$.pipe(
      switchMap(
        (token) => this.uniswapService.getReefPriceInInterval$(token),
        (tkn, prices) => [tkn, prices]
      ),
      tap(([tkn, prices]: [TokenSymbol, IReefPricePerToken]) => {
        if (this.wasLastCalcForToken === undefined) {
          this.tokenBalanceReef$.pipe(first()).subscribe((token) => {
            this.calcTokenAmount(token.balance, prices.TOKEN_PER_REEF, tkn);
          });
        } else {
          this.wasLastCalcForToken
            ? this.calcTokenAmount(this.reefAmount, prices.TOKEN_PER_REEF, tkn)
            : this.calcReefAmount(this.tokenAmount, prices.REEF_PER_TOKEN, tkn);
        }
      }),
      map(([tkn, prices]: [TokenSymbol, IReefPricePerToken]) => prices),
      catchError(() => {
        this.error$.next(true);
        return EMPTY;
      })
    );
  }

  calcTokenAmount(
    val: number,
    tokenPerReef: string,
    oppositeToken: TokenSymbol
  ): void {
    this.wasLastCalcForToken = true;
    if (val && val > 0) {
      const x = new BigNumber(val);
      const y = new BigNumber(tokenPerReef);
      const tokenAmt = x.multipliedBy(y).toNumber();
      this.tokenAmount = TokenUtil.toMaxDisplayDecimalPlaces(
        tokenAmt,
        oppositeToken
      );
      this.reefAmount = TokenUtil.toMaxDisplayDecimalPlaces(
        x.toNumber(),
        TokenSymbol.REEF
      );
      /*this.tokenAmount = roundDownTo(x.multipliedBy(y).toNumber(), 5);
      this.reefAmount = roundDownTo(x.toNumber(), 0);*/
    } else {
      this.tokenAmount = undefined;
      this.reefAmount = undefined;
    }
  }

  calcReefAmount(
    val: number,
    reefPerToken: string,
    oppositeToken: TokenSymbol
  ): void {
    this.wasLastCalcForToken = false;
    if (val && val > 0) {
      const x = new BigNumber(val);
      const y = new BigNumber(reefPerToken);
      const reefAmt = +x.multipliedBy(y).toNumber();

      this.reefAmount = TokenUtil.toMaxDisplayDecimalPlaces(
        reefAmt,
        TokenSymbol.REEF
      );
      this.tokenAmount = TokenUtil.toMaxDisplayDecimalPlaces(
        +x.toNumber(),
        oppositeToken
      );
      /*
      this.reefAmount = roundDownTo(reefAmt, 0);
      this.tokenAmount = roundDownTo(+x.toNumber(), 5);*/
    } else {
      this.reefAmount = undefined;
      this.tokenAmount = undefined;
    }
  }

  async addLiquidity(tokenSymbolB: TokenSymbol): Promise<void> {
    this.loading = true;

    const info: IProviderUserInfo =
      await this.connectorService.providerUserInfo$.pipe(take(1)).toPromise();
    const addresses = info.availableSmartContractAddresses;
    try {
      const lpTokenContract = await this.lpTokenContract$
        .pipe(first())
        .toPromise();
      const reefContract = await this.reefContract$.pipe(first()).toPromise();
      const hasAllowance = await this.uniswapService.approveTokenToRouter(
        lpTokenContract
      );
      const hasAllowance2 = await this.uniswapService.approveTokenToRouter(
        reefContract
      );
      if (hasAllowance) {
        if (tokenSymbolB === TokenSymbol.ETH) {
          await this.uniswapService.addLiquidityETH(
            addresses.REEF,
            this.reefAmount,
            this.tokenAmount,
            10
          );
        } else {
          await this.uniswapService.addLiquidity(
            addresses.REEF,
            AddressUtils.getTokenSymbolContractAddress(
              info.availableSmartContractAddresses,
              tokenSymbolB
            ),
            this.reefAmount,
            this.tokenAmount,
            10
          );
        }

        this.loading = false;
      }
      this.loading = false;
    } catch (e) {
      this.loading = false;
    }
  }

  /*private getPrice(): Observable<IReefPricePerToken> {
    return this.token$.pipe(
      first(val => !!val),
      tap((token: string) => this.initContracts(token)),
      switchMap(token => this.uniswapService.getLiveReefPrice$(TokenSymbol[token])),
      tap((prices: IReefPricePerToken) => {
        this.reefAmount = 1;
        this.tokenAmount = +prices.TOKEN_PER_REEF;
      }),
      catchError((e) => {
        console.log(e, 'wtf?')
        this.error$.next(true);
        return EMPTY;
      }),
    );
    /!*return this.token$.pipe(
      first(val => !!val),
      mergeMap((token) => {
        this.initContracts(token);
        return from(this.uniswapService.getReefPricePer(token));
      }),
      tap((prices: IReefPricePerToken) => {
        this.reefAmount = 1;
        this.tokenAmount = +prices.TOKEN_PER_REEF;
      }),
      catchError((e) => {
        console.log(e, 'error=', e);
        this.error$.next(true);
        return EMPTY;
      }),
    );*!/
  }*/

  public checkTokenTxPair(
    token: TokenSymbol,
    transactions: PendingTransaction[]
  ): boolean {
    if (transactions.length > 0) {
      return (
        (token === TokenSymbol.ETH &&
          transactions[0].type === TransactionType.LIQUIDITY_ETH) ||
        (token === TokenSymbol.USDT &&
          transactions[0].type === TransactionType.LIQUIDITY_USDT)
      );
    }
    return false;
  }

  preventDecimal($event: any): void {
    if ($event.key === '.' || $event.key === ',') {
      $event.preventDefault();
    }
  }
}
