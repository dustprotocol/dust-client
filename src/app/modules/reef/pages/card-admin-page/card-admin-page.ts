import {
  Component,
  Input,
  OnDestroy,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import {ConnectorService} from '../../../../core/services/connector.service';
import {
  HttpClient,
  HttpEvent,
  HttpEventType,
  HttpResponse,
  HttpResponseBase,
} from '@angular/common/http';
import {
  BehaviorSubject,
  combineLatest,
  merge,
  Observable,
  pipe,
  ReplaySubject,
  Subject,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  filter,
  map,
  mapTo,
  pluck,
  shareReplay,
  skipWhile,
  take,
  takeUntil,
} from 'rxjs/operators';
import {switchMap} from 'rxjs/internal/operators/switchMap';
import {of} from 'rxjs/internal/observable/of';
import {tap} from 'rxjs/internal/operators/tap';
import {MatDialog} from '@angular/material/dialog';
import {NotificationService} from '../../../../core/services/notification.service';
import {EthAuthService} from '../../../../core/services/eth-auth.service';
import {environment} from '../../../../../environments/environment';
import {startWith} from 'rxjs/internal/operators/startWith';
import {HttpUtil} from '../../../../shared/utils/http-util';
import {
  IProviderUserInfo,
  PendingTransaction,
  Token,
  TokenSymbol,
} from '../../../../core/models/types';
import {NgDestroyableComponent} from '../../../../shared/ng-destroyable-component';
import {TokenBalanceService} from '../../../../shared/service/token-balance.service';
import {TokenUtil} from 'src/app/shared/utils/token.util';
import {countryCodes} from '../../../../shared/data/country_codes';
import {MatSelectChange} from '@angular/material/select';

@Component({
  selector: 'app-card-admin-page',
  templateUrl: './card-admin-page.html',
  styleUrls: ['./card-admin-page.scss'],
})
export class CardAdminPage extends NgDestroyableComponent implements OnDestroy {
  set supportedTokens(val: { tokenSymbol: TokenSymbol; src: string }[]) {
    this.supportedTokensSub.next(val);
    this.selTokenSub.next(val[0].tokenSymbol);
  }

  baanxBaseUrl = 'https://reeffinance.baanx.co.uk';
  // baanxBaseUrl = environment.production?'https://reeffinance.baanx.co.uk': environment.reefNodeApiUrl;
  cardBaseUrl = environment.reefNodeApiUrl;
  accountCardRegistered$: Observable<boolean>;
  cardVerified$: Observable<boolean>;
  iframeSession$: Observable<any>;
  createUser: Subject<any> = new Subject<any>();
  destroyed$ = new Subject<void>();
  @ViewChild('cardFormDialog') cardFormDialog: TemplateRef<any>;
  loading$: Observable<boolean>;

  selectedTokenBalance$: Observable<Token>;
  supportedTokensSub = new BehaviorSubject<{ tokenSymbol: TokenSymbol; src: string }[]>([]);
  selTokenSub = new ReplaySubject<TokenSymbol>();
  tokenAmountSub = new BehaviorSubject<number>(null);
  TokenSymbol = TokenSymbol;
  cardBalance$: Observable<string>;
  TokenUtil = TokenUtil;
  GENDER_OPTIONS: { v: string, l: string }[] = [{v: 'M', l: 'Male'}, {v: 'F', l: 'Female'}];
  countryCodes = countryCodes;

  constructor(
    public readonly connectorService: ConnectorService,
    private dialog: MatDialog,
    private notificationService: NotificationService,
    private ethAuthService: EthAuthService,
    private http: HttpClient,
    private tokenBalanceService: TokenBalanceService
  ) {
    super();
    this.supportedTokens = TokenBalanceService.SUPPORTED_CARD_TOKENS;
    const existingUser$ = connectorService.providerUserInfo$.pipe(
      switchMap((userInfo: any) => {
        if (userInfo) {
          return this.http
            .get(this.cardBaseUrl + '/card/' + userInfo.address)
            .pipe(
              tap((v) => console.log('PROOO', v)),
              catchError((e) => {
                if (e.status === 404 || e.status === 400) {
                  console.log('Existing user 404 err=', e);
                  return of({type: HttpEventType.Response});
                }
                return of({error: e.message, type: HttpEventType.Response});
              })
            );
        }
        return of({
          _status: {message: 'No wallet connected'},
        });
      })
    );

    const newUserCreated$ = this.createUser.asObservable().pipe(
      tap((v) => console.log('c00', v)),
      /*map((u) => ({
        external_id: u.address,
        title: 'Mr',
        gender: 'M',
        addressLine1: '1 St Peters Square',
        addressLine2: '22 St Peters Square',
        cityOrTown: 'Manchester',
        countryName: 'USA',
        country_code: '+44',
        first_name: 'Bob',
        last_name: 'Dole',
        selected_country: 'GBR',
        email: 'bob.dole1@baanx.com',
        phone_number: '7597234866',
        house_number: 99,
        postcode: 'M202RH',
        dateOfBirth: '1980-01-01T00:00:00.000Z',
      })),*/
      /*map((u) => ({
        external_id: u.external_id,
        addressLine1: 'Rozicno 8',
        addressLine2: '',
        cityOrTown: 'Kamnik',
        countryName: 'Slovenia',
        country_code: '+386',
        dateOfBirth: '1977-10-23T00:00:00.000Z',
        email: 'matjaz.hirsman@gmail.com',
        first_name: 'Matjaz',
        gender: 'M',
        house_number: '8',
        last_name: 'Hirsman',
        phone_number: '41661599',
        postcode: '1240',
        selected_country: 'SI',
        title: 'Mr',
      })),*/
      switchMap((newUser: any) => {
          return of(null)
          // newUser.title = newUser.gender === 'M' ? 'Mr' : 'Mrs';
          return this.ethAuthService.signCardApplication$(JSON.stringify(newUser));
        }
      ),
      switchMap((uData) =>
        this.http
          .post(this.cardBaseUrl + '/card', uData, {
            // reportProgress: true,
          })
          .pipe(
            map((v: any) => {
              console.log('Created user=', v);
              if (!!v && !!v.error) {
                console.log('Error 0 creating user', v);
                return {error: v.error.message, type: HttpEventType.Response};
              }
              return v;
            }),
            catchError((e) => {
              console.log('Error 1 creating user=', e);
              return of({
                error: e.error.message,
                type: HttpEventType.Response,
              });
            }),
            startWith({type: HttpEventType.Sent})
          )
      )
    );
    const userData$ = merge(existingUser$, newUserCreated$).pipe(
      shareReplay(1)
    );
    // TODO display loading
    this.loading$ = userData$.pipe(
      map((v: any) =>
        !!v && !!v.external_id ? {type: HttpEventType.Response} : v
      ),
      filter((v) => this.isRequestStatus(v)),
      map((event: any) => {
        console.log('REQQQ', event);
        switch (event.type) {
          case HttpEventType.Sent:
            console.log('Request sent!');
            return true;
            break;
          case HttpEventType.ResponseHeader:
            console.log('Response header received!');
            return true;
            break;
          case HttpEventType.UploadProgress:
            // const percentDone = Math.round(100 * event.loaded / event.total);
            console.log(`File is being uploaded.`);
            return true;
          case HttpEventType.DownloadProgress:
            // const kbLoaded = Math.round(event.loaded / 1024);
            console.log(`Download in progress!`);
            return true;
            break;
          case HttpEventType.Response:
            console.log('😺 Done!', event.body);
            return false;
        }
      }),
      startWith(true),
      distinctUntilChanged()
    );
    const baanxUser$ = userData$.pipe(
      filter((v) => !!this.isBaanxUser(v)),
      tap((v) => console.log('BAANX u=', v)),
      tap((v) => console.log('existing u1=', v)),
      map((res: any) => (!!res && !res.error ? res : null)),
      shareReplay(1)
    );
    this.cardVerified$ = baanxUser$.pipe(
      map((user: any) => !!user && !!user.verification_state),
      shareReplay(1)
    );
    this.accountCardRegistered$ = baanxUser$.pipe(
      map((res) => !!res),
      tap((v) => console.log('CARD REG u=', v)),
      shareReplay(1)
    );
    this.iframeSession$ = baanxUser$.pipe(
      switchMap((bUser: any) =>
        bUser
          ? this.http.post(this.cardBaseUrl + '/card/session', {
            reefCardId: bUser.external_id,
          })
          : of({error: true, type: HttpEventType.Response})
      ),
      catchError((v) => {
        console.log('session error=', v);
        return of({error: true, type: HttpEventType.Response});
      }),
      shareReplay(1)
    );

    userData$
      .pipe(
        takeUntil(this.destroyed$),
        filter((e: any) => {
          const skip = !!e && !!e.error;
          return skip;
        }),
        map((e) => (e.error ? e.error : e))
      )
      .subscribe((errMsg: any) => {
        console.log('Err msg=', errMsg);
        this.dialog.closeAll();
        this.notificationService.showNotification(
          errMsg.message || errMsg,
          'Close',
          'error'
        );
      });

    this.selectedTokenBalance$ = combineLatest([
      this.selTokenSub,
      this.connectorService.providerUserInfo$.pipe(filter((v) => !!v)),
    ]).pipe(
      switchMap(([tokenSymbol, uInfo]: [TokenSymbol, IProviderUserInfo]) =>
        this.tokenBalanceService.getTokenBalance$(uInfo.address, tokenSymbol)
      ),
      shareReplay(1)
    ) as Observable<Token>;

    this.selTokenSub
      .pipe(takeUntil(this.onDestroyed$))
      .subscribe(() => this.tokenAmountSub.next(null));
  }

  private isRequestStatus(v): boolean {
    // TODO find better solution for checking response
    const isReqStat =
      v instanceof HttpResponseBase || (!!v && !!v.type != null);
    console.log('STAT=', isReqStat, v);
    return isReqStat;
  }

  private isBaanxUser(v): boolean {
    // TODO find better solution for checking response
    return !!v && !!v.external_id;
  }

  ngOnDestroy(): void {
    this.destroyed$.next(null);
  }

  openCardForm(): void {
    this.dialog
      .open(this.cardFormDialog, {})
      .afterClosed()
      .pipe(take(1))
      .subscribe((formData: boolean) => {
        if (formData) {
          // createUser.next({address: userInfo.address})
        }
      });
  }

  transferToCard() {
  }

  setCountryName(cardData: any, countryCode: any, countries: any[]): void {
    cardData.countryName = countries.find(c => c['alpha-2'] === countryCode).name;
  }
}
